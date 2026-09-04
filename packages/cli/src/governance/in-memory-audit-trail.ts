import { Injectable } from '@nestjs/common';
import type { AuditTrailStore, EscalationRecord } from './audit-trail.port.js';

/**
 * In-memory implementation of {@link AuditTrailStore} (H11 D6).
 * Suitable for testing and single-session scenarios. Data does not
 * survive process restarts.
 */
@Injectable()
export class InMemoryAuditTrail implements AuditTrailStore {
  private readonly entries: EscalationRecord[] = [];

  async record(entry: EscalationRecord): Promise<void> {
    this.entries.push(entry);
  }

  async queryByTaskId(taskId: string): Promise<EscalationRecord[]> {
    return this.entries.filter((e) => e.taskId === taskId);
  }

  async queryByTimeRange(
    from: number,
    to: number,
  ): Promise<EscalationRecord[]> {
    return this.entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
  }
}
