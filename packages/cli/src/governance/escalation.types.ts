import type { CapabilityTier } from './capability-tier.js';

/** Human-readable justification for requesting a tier escalation. */
export interface EscalationRequestFields {
  readonly whatUnresolved: string;
  readonly whyInsufficient: string;
  readonly expectedCapability: string;
  readonly valueJustification: string;
}

/** Full escalation request with metadata. */
export interface EscalationRequest extends EscalationRequestFields {
  readonly id: string;
  readonly sourceTier: CapabilityTier;
  readonly targetTier: CapabilityTier;
  readonly createdAt: number;
}

/** Outcome of an escalation decision. */
export type EscalationDecision = 'approved' | 'denied' | 'deferred';

/** Result of evaluating an automatic escalation gate. */
export interface AutomaticEscalationResult {
  readonly escalated: boolean;
  readonly targetTier?: CapabilityTier;
  readonly reason?: string;
}
