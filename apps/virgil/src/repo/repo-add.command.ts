import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { PromptService } from '../shared/prompt.service.js';
import { formatOutput } from '../shared/output.formatter.js';
import { RepoAddInputSchema, RepoAddOutputSchema } from './repo.schemas.js';
import { RepoService } from './repo.service.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'add',
  description: 'Register a repository in the workspace.',
  arguments: '[path] [alias]',
})
export class RepoAddCommand extends CommandRunner {
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
    let path = passedParams[0];
    if (!path) {
      path = await this.promptService.input('Repository path');
    }

    let alias: string | undefined = passedParams[1];
    if (!alias) {
      alias =
        (await this.promptService.input('Alias (optional, press enter to skip)')) ||
        undefined;
    }

    const input = RepoAddInputSchema.parse({ path, alias });
    const result = this.repoService.add(input);
    const output = RepoAddOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
