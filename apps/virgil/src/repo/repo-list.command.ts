import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { formatOutput } from '../shared/output.formatter.js';
import { RepoListOutputSchema } from './repo.schemas.js';
import { RepoService } from './repo.service.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'list',
  description: 'List all registered repositories.',
})
export class RepoListCommand extends CommandRunner {
  constructor(private readonly repoService: RepoService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const result = this.repoService.list();
    const output = RepoListOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
