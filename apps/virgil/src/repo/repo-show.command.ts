import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { PromptService } from '../shared/prompt.service.js';
import { formatOutput } from '../shared/output.formatter.js';
import { RepoShowInputSchema, RepoShowOutputSchema } from './repo.schemas.js';
import { RepoService } from './repo.service.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'show',
  description: 'Show details for a registered repository.',
  arguments: '[alias]',
})
export class RepoShowCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    let alias = passedParams[0];
    if (!alias) {
      const repos = this.repoService.list();
      alias = await this.promptService.select(
        'Select a repository',
        repos.map((r) => ({ name: r.alias, value: r.alias })),
      );
    }

    const input = RepoShowInputSchema.parse({ alias });
    const result = this.repoService.show(input.alias);
    const output = RepoShowOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
