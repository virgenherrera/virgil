import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { PromptService } from '../shared/prompt.service.js';
import { formatOutput } from '../shared/output.formatter.js';
import {
  ProviderAddInputSchema,
  ProviderAddOutputSchema,
  type ProviderType,
} from './provider.schemas.js';
import { ProviderService } from './provider.service.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'add',
  description: 'Add a provider to the workspace.',
  arguments: '[type]',
})
export class ProviderAddCommand extends CommandRunner {
  constructor(
    private readonly providerService: ProviderService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    let type: string | undefined = passedParams[0];
    if (!type) {
      type = await this.promptService.select<ProviderType>(
        'Select provider type',
        [
          { name: 'Repository', value: 'repo' },
          { name: 'Knowledge base', value: 'knowledge' },
          { name: 'Issue tracker', value: 'issue' },
          { name: 'Chat', value: 'chat' },
        ],
      );
    }

    const input = ProviderAddInputSchema.parse({ type });
    const result = this.providerService.add(input);
    const output = ProviderAddOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
