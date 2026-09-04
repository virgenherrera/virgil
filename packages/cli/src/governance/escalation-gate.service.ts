import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import { BudgetGovernor } from './budget-governor.service.js';
import type { TaskDescriptor } from './task-descriptor.schema.js';
import type {
  EscalationRequest,
  EscalationRequestFields,
  EscalationDecision,
  AutomaticEscalationResult,
} from './escalation.types.js';
import type { ComplexitySignal } from './task-descriptor.schema.js';

/** Complexity signals that indicate reasoning-level work. */
const REASONING_COMPLEXITY: ReadonlySet<ComplexitySignal> = new Set([
  'architecture',
  'synthesis',
  'review',
]);

/**
 * Escalation gate service (H11 D5). Manages two types of escalation:
 *
 * 1. **Automatic** (worker → reasoning): triggers on budget exceeded or
 *    complexity detection. No human involvement.
 * 2. **Human-gated** (reasoning → pro): creates an EscalationRequest that
 *    blocks until a human responds. NO silent pro activation ever.
 */
@Injectable()
export class EscalationGate {
  private requestIdCounter = 0;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (decision: EscalationDecision) => void }
  >();
  private requestHandler: ((req: EscalationRequest) => void) | null = null;

  constructor(private readonly budgetGovernor: BudgetGovernor) {}

  /**
   * Evaluate whether an automatic escalation should occur.
   * Automatic escalation only happens worker → reasoning, NEVER to pro.
   */
  async evaluateAutomaticEscalation(
    currentTier: CapabilityTier,
    task: TaskDescriptor,
  ): Promise<AutomaticEscalationResult> {
    // Automatic escalation is only valid from worker → reasoning.
    if (currentTier !== CapabilityTier.Worker) {
      return { escalated: false };
    }

    // Check budget exceeded.
    const budgetStatus = this.budgetGovernor.checkBudget(currentTier);
    if (budgetStatus.status === 'exceeded') {
      return {
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
        reason: 'Budget exceeded for worker tier',
      };
    }

    // Check complexity mismatch.
    if (REASONING_COMPLEXITY.has(task.complexitySignal)) {
      return {
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
        reason: `Complexity signal "${task.complexitySignal}" requires reasoning tier`,
      };
    }

    return { escalated: false };
  }

  /**
   * Request human-gated escalation (typically reasoning → pro).
   * Returns a Promise that resolves when a human decision arrives.
   */
  async requestHumanEscalation(
    sourceTier: CapabilityTier,
    targetTier: CapabilityTier,
    fields: EscalationRequestFields,
  ): Promise<EscalationDecision> {
    const id = `esc-${++this.requestIdCounter}`;
    const request: EscalationRequest = {
      id,
      sourceTier,
      targetTier,
      createdAt: Date.now(),
      ...fields,
    };

    return new Promise<EscalationDecision>((resolve) => {
      this.pendingRequests.set(id, { resolve });
      if (this.requestHandler) {
        this.requestHandler(request);
      }
    });
  }

  /** Register a handler that receives escalation requests (for UI/CLI integration). */
  onEscalationRequest(handler: (req: EscalationRequest) => void): void {
    this.requestHandler = handler;
  }

  /** Resolve a pending escalation request with a human decision. */
  resolveEscalation(requestId: string, decision: EscalationDecision): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve(decision);
    }
  }
}
