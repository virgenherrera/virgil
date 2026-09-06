import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from './workspace.service.js';
import { PromptService } from '../shared/prompt.service.js';
import {
  WorkspaceDeleteInputSchema,
  WorkspaceDeleteOptionsSchema,
  WorkspaceDeleteOutputSchema,
} from './workspace.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';

@SubCommand({
  name: 'delete',
  description: 'Delete a Virgil workspace.',
  arguments: '[slug]',
})
export class WorkspaceDeleteCommand extends CommandRunner {
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
        'Select workspace to delete',
        entries.map((e) => ({
          name: e.metadata.displayName ?? e.metadata.slug,
          value: e.metadata.slug,
        })),
      );
    }

    const opts = WorkspaceDeleteOptionsSchema.parse(options ?? {});
    let confirmed = opts.confirm;
    if (!confirmed) {
      confirmed = await this.promptService.confirm(
        `Delete workspace "${slug}"? This cannot be undone.`,
        { default: false },
      );
    }

    const input = WorkspaceDeleteInputSchema.parse({ slug, confirm: confirmed });
    if (input.confirm) {
      await this.workspaceService.delete(input.slug);
    }
    const output = WorkspaceDeleteOutputSchema.parse({
      slug: input.slug,
      deleted: input.confirm,
    });

    console.log(formatOutput(output, opts.json));
  }

  @Option({
    flags: '--confirm',
    description: 'Skip confirmation prompt',
  })
  parseConfirm(): boolean {
    return true;
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
