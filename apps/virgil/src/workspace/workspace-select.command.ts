import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from './workspace.service.js';
import { PromptService } from '../shared/prompt.service.js';
import {
  WorkspaceSelectInputSchema,
  WorkspaceSelectOutputSchema,
} from './workspace.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'select',
  description: 'Select the active Virgil workspace.',
  arguments: '[slug]',
})
export class WorkspaceSelectCommand extends CommandRunner {
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
        'Select workspace',
        workspaces.workspaces.map((w) => ({ name: w.name, value: w.slug })),
      );
    }

    const input = WorkspaceSelectInputSchema.parse({ slug });
    const result = this.workspaceService.select(input);
    const output = WorkspaceSelectOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
