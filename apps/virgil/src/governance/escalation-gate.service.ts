import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import { BudgetGovernor } from './budget-governor.service.js';
import type { TaskDescriptor, ComplexitySignal } from './task-descriptor.schema.js';
import type {
  EscalationRequest,
  EscalationRequestFields,
  EscalationDecision,
  AutomaticEscalationResult,
} from './escalation.types.js';

const REASONING_COMPLEXITY: ReadonlySet<ComplexitySignal> = new Set([
  'architecture',
  'synthesis',
  'review',
]);

@Injectable()
export class EscalationGate {
  private requestIdCounter = 0;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (decision: EscalationDecision) => void }
  >();
  private requestHandler: ((req: EscalationRequest) => void) | null = null;

  constructor(private readonly budgetGovernor: BudgetGovernor) {}

  async evaluateAutomaticEscalation(
    currentTier: CapabilityTier,
    task: TaskDescriptor,
  ): Promise<AutomaticEscalationResult> {
    if (currentTier !== CapabilityTier.Worker) {
      return { escalated: false };
    }

    const budgetStatus = this.budgetGovernor.checkBudget(currentTier);
    if (budgetStatus.status === 'exceeded') {
      return {
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
        reason: 'Budget exceeded for worker tier',
      };
    }

    if (REASONING_COMPLEXITY.has(task.complexitySignal)) {
      return {
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
        reason: `Complexity signal "${task.complexitySignal}" requires reasoning tier`,
      };
    }

    return { escalated: false };
  }

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

  onEscalationRequest(handler: (req: EscalationRequest) => void): void {
    this.requestHandler = handler;
  }

  resolveEscalation(requestId: string, decision: EscalationDecision): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve(decision);
    }
  }
}
