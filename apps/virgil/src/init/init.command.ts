import { Command, CommandRunner, Option } from 'nest-commander';
import { basename } from 'node:path';
import {
  InitInputSchema,
  InitOptionsSchema,
  InitOutputSchema,
} from './init.schemas.js';
import { InitService } from './init.service.js';
import { PromptService } from '../shared/prompt.service.js';
import { sanitizeSlug, WorkspaceSlugSchema } from '../shared/schemas.js';
import { formatOutput } from '../shared/output.formatter.js';

@Command({
  name: 'init',
  description: 'Initialise a Virgil workspace in the current directory.',
  arguments: '[path]',
})
export class InitCommand extends CommandRunner {
  constructor(
    private readonly initService: InitService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const path = passedParams[0] ?? process.cwd();
    const opts = InitOptionsSchema.parse(options ?? {});

    let slug = opts.slug;
    if (!slug) {
      const derived = sanitizeSlug(basename(path));
      const valid = WorkspaceSlugSchema.safeParse(derived);
      if (valid.success) {
        slug = derived;
      } else {
        slug = await this.promptService.input('Workspace slug');
      }
    }

    const name = opts.name;
    const skipProviders = opts.skipProviders;

    const input = InitInputSchema.parse({ path, slug, name, skipProviders });
    const result = this.initService.init(input);
    const output = InitOutputSchema.parse(result);

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--slug <slug>', description: 'Workspace slug' })
  parseSlug(value: string): string {
    return value;
  }

  @Option({ flags: '--name <name>', description: 'Workspace display name' })
  parseName(value: string): string {
    return value;
  }

  @Option({
    flags: '--skip-providers',
    description: 'Skip the provider wizard',
  })
  parseSkipProviders(): boolean {
    return true;
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
