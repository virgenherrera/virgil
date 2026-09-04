import { Command, CommandRunner } from 'nest-commander';
import { GovernanceBudgetCommand } from './governance-budget.command.js';
import { GovernanceAuditCommand } from './governance-audit.command.js';

@Command({
  name: 'governance',
  description: 'Governance commands (budget, audit).',
  subCommands: [GovernanceBudgetCommand, GovernanceAuditCommand],
})
export class GovernanceCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
