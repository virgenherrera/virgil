import { Module } from '@nestjs/common';
import { RuleBasedTierResolver } from './rule-based-tier-resolver.js';
import { HarnessRegistry } from './harness-registry.service.js';
import { BudgetGovernor } from './budget-governor.service.js';
import { EscalationGate } from './escalation-gate.service.js';
import { InMemoryAuditTrail } from './in-memory-audit-trail.js';
import { TIER_RESOLVER, AUDIT_TRAIL_STORE } from './governance.constants.js';

/**
 * Static governance module (H11 D7). Importable by OrchestrationModule
 * without circular dependencies.
 *
 * Exports:
 * - TierResolver (via TIER_RESOLVER token)
 * - HarnessRegistry
 * - BudgetGovernor
 * - EscalationGate
 * - AuditTrailStore (via AUDIT_TRAIL_STORE token)
 */
@Module({
  providers: [
    { provide: TIER_RESOLVER, useClass: RuleBasedTierResolver },
    HarnessRegistry,
    BudgetGovernor,
    EscalationGate,
    { provide: AUDIT_TRAIL_STORE, useClass: InMemoryAuditTrail },
  ],
  exports: [
    TIER_RESOLVER,
    HarnessRegistry,
    BudgetGovernor,
    EscalationGate,
    AUDIT_TRAIL_STORE,
  ],
})
export class GovernanceModule {}
