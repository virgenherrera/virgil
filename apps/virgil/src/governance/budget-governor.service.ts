import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { CapabilityTier } from './capability-tier.js';
import type { BudgetPolicy } from './budget-policy.schema.js';

export type BudgetStatus =
  | { status: 'within_budget' }
  | { status: 'warning'; percentUsed: number }
  | { status: 'exceeded'; overBy: number };

export interface BudgetEvent {
  type: 'budget:warning' | 'budget:exceeded';
  tier: CapabilityTier;
  percentUsed: number;
  totalConsumed: number;
  limit: number;
}

@Injectable()
export class BudgetGovernor extends EventEmitter {
  private totalInput = 0;
  private totalOutput = 0;
  private interactionDepth = 0;
  private policy: BudgetPolicy | null = null;
  private lastEmittedStatus: Map<CapabilityTier, string> = new Map();

  configure(policy: BudgetPolicy): void {
    this.policy = policy;
    this.lastEmittedStatus.clear();
  }

  recordConsumption(input: number, output: number): void {
    this.totalInput += input;
    this.totalOutput += output;
    this.interactionDepth++;
  }

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
