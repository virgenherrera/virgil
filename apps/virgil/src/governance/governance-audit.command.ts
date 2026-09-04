import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { formatOutput } from '../shared/output.formatter.js';
import { AuditOptionsSchema, AuditOutputSchema } from './governance.schemas.js';
import { GovernanceService } from './governance.service.js';

@SubCommand({
  name: 'audit',
  description: 'Show audit log of agent actions.',
})
export class GovernanceAuditCommand extends CommandRunner {
  constructor(private readonly governanceService: GovernanceService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const opts = AuditOptionsSchema.parse(options ?? {});
    const result = this.governanceService.audit(opts.since);
    const output = AuditOutputSchema.parse(result);
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }

  @Option({ flags: '--since <since>', description: 'Filter entries since date' })
  parseSince(val: string): string {
    return val;
  }
}
