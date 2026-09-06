import type { CapabilityTier } from './capability-tier.js';

export interface EscalationRequestFields {
  readonly whatUnresolved: string;
  readonly whyInsufficient: string;
  readonly expectedCapability: string;
  readonly valueJustification: string;
}

export interface EscalationRequest extends EscalationRequestFields {
  readonly id: string;
  readonly sourceTier: CapabilityTier;
  readonly targetTier: CapabilityTier;
  readonly createdAt: number;
}

export type EscalationDecision = 'approved' | 'denied' | 'deferred';

export interface AutomaticEscalationResult {
  readonly escalated: boolean;
  readonly targetTier?: CapabilityTier;
  readonly reason?: string;
}
