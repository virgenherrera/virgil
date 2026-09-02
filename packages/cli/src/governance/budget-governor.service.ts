import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { CapabilityTier } from './capability-tier.js';
import type { BudgetPolicy } from './budget-policy.schema.js';

/** Discriminated union for budget status checks. */
export type BudgetStatus =
  | { status: 'within_budget' }
  | { status: 'warning'; percentUsed: number }
  | { status: 'exceeded'; overBy: number };

/** Structured event emitted on budget threshold crossings. */
export interface BudgetEvent {
  type: 'budget:warning' | 'budget:exceeded';
  tier: CapabilityTier;
  percentUsed: number;
  totalConsumed: number;
  limit: number;
}

/**
 * Session-scoped budget governor (H11 D4). Tracks cumulative token
 * consumption and emits structured events via the EventEmitter pattern
 * when warning or exceeded thresholds are crossed.
 */
@Injectable()
export class BudgetGovernor extends EventEmitter {
  private totalInput = 0;
  private totalOutput = 0;
  private interactionDepth = 0;
  private policy: BudgetPolicy | null = null;
  private lastEmittedStatus: Map<CapabilityTier, string> = new Map();

  /** Configure the budget policy. Must be called before budget checks. */
  configure(policy: BudgetPolicy): void {
    this.policy = policy;
    this.lastEmittedStatus.clear();
  }

  /** Record token consumption for the current session. */
  recordConsumption(input: number, output: number): void {
    this.totalInput += input;
    this.totalOutput += output;
    this.interactionDepth++;
  }

  /** Check budget status for a given tier. Emits events on threshold crossings. */
  checkBudget(tier: CapabilityTier): BudgetStatus {
    if (!this.policy) {
      return { status: 'within_budget' };
    }

    const limit = this.limitForTier(tier);
    const consumed = this.totalInput + this.totalOutput;
    const percentUsed = Math.round((consumed / limit) * 100);

    let result: BudgetStatus;

    if (consumed > limit) {
      result = { status: 'exceeded', overBy: consumed - limit };
      if (this.lastEmittedStatus.get(tier) !== 'exceeded') {
        this.lastEmittedStatus.set(tier, 'exceeded');
        const event: BudgetEvent = {
          type: 'budget:exceeded',
          tier,
          percentUsed,
          totalConsumed: consumed,
          limit,
        };
        this.emit('budget:exceeded', event);
      }
    } else if (percentUsed >= this.policy.warningThresholdPercent) {
      result = { status: 'warning', percentUsed };
      if (this.lastEmittedStatus.get(tier) !== 'warning') {
        this.lastEmittedStatus.set(tier, 'warning');
        const event: BudgetEvent = {
          type: 'budget:warning',
          tier,
          percentUsed,
          totalConsumed: consumed,
          limit,
        };
        this.emit('budget:warning', event);
      }
    } else {
      result = { status: 'within_budget' };
    }

    return result;
  }

  /** Return remaining tokens for the given tier. */
  remainingBudget(tier: CapabilityTier): number {
    if (!this.policy) {
      return Infinity;
    }
    const limit = this.limitForTier(tier);
    const consumed = this.totalInput + this.totalOutput;
    return Math.max(0, limit - consumed);
  }

  private limitForTier(tier: CapabilityTier): number {
    if (!this.policy) return Infinity;
    switch (tier) {
      case CapabilityTier.Worker:
        return this.policy.workerTokenLimit;
      case CapabilityTier.Reasoning:
        return this.policy.reasoningTokenLimit;
      case CapabilityTier.Pro:
        return this.policy.proTokenLimit;
    }
  }
}
