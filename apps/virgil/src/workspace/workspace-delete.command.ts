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
      const workspaces = this.workspaceService.list();
      slug = await this.promptService.select(
        'Select workspace to delete',
        workspaces.workspaces.map((w) => ({ name: w.name, value: w.slug })),
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
    const result = this.workspaceService.delete(input);
    const output = WorkspaceDeleteOutputSchema.parse(result);

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
