import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from './workspace.service.js';
import { PromptService } from '../shared/prompt.service.js';
import {
  WorkspaceShowInputSchema,
  WorkspaceShowOutputSchema,
} from './workspace.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'show',
  description: 'Show details of a Virgil workspace.',
  arguments: '[slug]',
})
export class WorkspaceShowCommand extends CommandRunner {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    let slug = passedParams[0];
    if (!slug) {
      const entries = await this.workspaceService.list();
      slug = await this.promptService.select(
        'Select workspace',
        entries.map((e) => ({
          name: e.metadata.displayName ?? e.metadata.slug,
          value: e.metadata.slug,
        })),
      );
    }

    const input = WorkspaceShowInputSchema.parse({ slug });
    const details = await this.workspaceService.show(input.slug);
    const output = WorkspaceShowOutputSchema.parse({
      slug: details.metadata.slug,
      name: details.metadata.displayName ?? details.metadata.slug,
      path: details.path,
      active: details.active,
    });
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
