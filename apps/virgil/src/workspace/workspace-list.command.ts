import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from './workspace.service.js';
import {
  WorkspaceListInputSchema,
  WorkspaceListOutputSchema,
} from './workspace.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'list',
  description: 'List all Virgil workspaces.',
})
export class WorkspaceListCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    WorkspaceListInputSchema.parse({});
    const entries = await this.workspaceService.list();
    const output = WorkspaceListOutputSchema.parse({
      workspaces: entries.map((e) => ({
        slug: e.metadata.slug,
        name: e.metadata.displayName ?? e.metadata.slug,
        active: e.active,
      })),
    });
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
