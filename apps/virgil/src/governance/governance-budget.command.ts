import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { formatOutput } from '../shared/output.formatter.js';
import { BudgetOptionsSchema, BudgetOutputSchema } from './governance.schemas.js';
import { GovernanceService } from './governance.service.js';

@SubCommand({
  name: 'budget',
  description: 'Show token budget usage.',
})
export class GovernanceBudgetCommand extends CommandRunner {
  constructor(private readonly governanceService: GovernanceService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const opts = BudgetOptionsSchema.parse(options ?? {});
    const result = this.governanceService.budget(opts.period);
    const output = BudgetOutputSchema.parse(result);
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }

  @Option({ flags: '--period <period>', description: 'Budget period filter' })
  parsePeriod(val: string): string {
    return val;
  }
}
