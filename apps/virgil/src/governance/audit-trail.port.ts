import type { CapabilityTier } from './capability-tier.js';

export interface EscalationRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly taskId: string;
  readonly sourceTier: CapabilityTier;
  readonly targetTier: CapabilityTier;
  readonly triggerType: 'automatic' | 'human-gated';
  readonly justification: string;
  readonly approvalStatus: 'approved' | 'denied' | 'deferred' | 'pending';
  readonly approvedBy: string | null;
}

export interface AuditTrailStore {
  record(entry: EscalationRecord): Promise<void>;
  queryByTaskId(taskId: string): Promise<EscalationRecord[]>;
  queryByTimeRange(from: number, to: number): Promise<EscalationRecord[]>;
}
