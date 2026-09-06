import { Inject, Injectable } from '@nestjs/common';
import { BudgetGovernor } from './budget-governor.service.js';
import { CapabilityTier } from './capability-tier.js';
import { AUDIT_TRAIL_STORE } from './governance.constants.js';
import type { AuditTrailStore, EscalationRecord } from './audit-trail.port.js';
import type { BudgetOutput, AuditOutput } from './governance.schemas.js';

@Injectable()
export class GovernanceService {
  constructor(
    private readonly budgetGovernor: BudgetGovernor,
    @Inject(AUDIT_TRAIL_STORE)
    private readonly auditTrail: AuditTrailStore,
  ) {}

  budget(period?: string): BudgetOutput {
    const tiers = [
      CapabilityTier.Worker,
      CapabilityTier.Reasoning,
      CapabilityTier.Pro,
    ] as const;

    let total = 0;
    let remaining = 0;
    for (const tier of tiers) {
      const r = this.budgetGovernor.remainingBudget(tier);
      if (!Number.isFinite(r)) continue;
      total += r;
      remaining += r;
    }

    return {
      total,
      used: total - remaining,
      remaining,
      period: period ?? 'session',
    };
  }

  async audit(since?: string): Promise<AuditOutput> {
    const from = since ? new Date(since).getTime() : 0;
    const to = Date.now();
    const records = await this.auditTrail.queryByTimeRange(from, to);
    return records.map((r: EscalationRecord) => ({
      timestamp: new Date(r.timestamp).toISOString(),
      action: r.triggerType,
      agent: r.sourceTier,
      tokens: 0,
    }));
  }
}
