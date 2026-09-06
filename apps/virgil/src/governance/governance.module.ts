import { Module } from '@nestjs/common';
import { GovernanceCommand } from './governance.command.js';
import { GovernanceBudgetCommand } from './governance-budget.command.js';
import { GovernanceAuditCommand } from './governance-audit.command.js';
import { GovernanceService } from './governance.service.js';
import { RuleBasedTierResolver } from './rule-based-tier-resolver.js';
import { HarnessRegistry } from './harness-registry.service.js';
import { BudgetGovernor } from './budget-governor.service.js';
import { EscalationGate } from './escalation-gate.service.js';
import { InMemoryAuditTrail } from './in-memory-audit-trail.js';
import { TIER_RESOLVER, AUDIT_TRAIL_STORE } from './governance.constants.js';

@Module({
  providers: [
    { provide: TIER_RESOLVER, useClass: RuleBasedTierResolver },
    { provide: AUDIT_TRAIL_STORE, useClass: InMemoryAuditTrail },
    HarnessRegistry,
    BudgetGovernor,
    EscalationGate,
    GovernanceService,
    GovernanceCommand,
    GovernanceBudgetCommand,
    GovernanceAuditCommand,
  ],
  exports: [
    TIER_RESOLVER,
    AUDIT_TRAIL_STORE,
    HarnessRegistry,
    BudgetGovernor,
    EscalationGate,
    GovernanceService,
  ],
})
export class GovernanceModule {}
