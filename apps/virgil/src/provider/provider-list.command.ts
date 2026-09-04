import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { formatOutput } from '../shared/output.formatter.js';
import { ProviderListOutputSchema } from './provider.schemas.js';
import { ProviderService } from './provider.service.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'list',
  description: 'List all configured providers.',
})
export class ProviderListCommand extends CommandRunner {
  constructor(private readonly providerService: ProviderService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const result = this.providerService.list();
    const output = ProviderListOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
