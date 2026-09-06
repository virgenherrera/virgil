import type { CapabilityTier } from './capability-tier.js';

/** Record of a single escalation event persisted in the audit trail. */
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

/**
 * Storage abstraction for the escalation audit trail (H11 D6).
 * Implementations persist escalation records for governance compliance.
 */
export interface AuditTrailStore {
  /** Persist an escalation record. */
  record(entry: EscalationRecord): Promise<void>;

  /** Query all records for a given task. */
  queryByTaskId(taskId: string): Promise<EscalationRecord[]>;

  /** Query records within a time range (inclusive). */
  queryByTimeRange(from: number, to: number): Promise<EscalationRecord[]>;
}
