import { Module } from '@nestjs/common';
import { GovernanceCommand } from './governance.command.js';
import { GovernanceBudgetCommand } from './governance-budget.command.js';
import { GovernanceAuditCommand } from './governance-audit.command.js';
import { GovernanceService } from './governance.service.js';

@Module({
  providers: [
    GovernanceService,
    GovernanceCommand,
    GovernanceBudgetCommand,
    GovernanceAuditCommand,
  ],
})
export class GovernanceModule {}
