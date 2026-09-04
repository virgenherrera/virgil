import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from './workspace.service.js';
import { PromptService } from '../shared/prompt.service.js';
import {
  WorkspaceCreateInputSchema,
  WorkspaceCreateOutputSchema,
} from './workspace.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'create',
  description: 'Create a new Virgil workspace.',
  arguments: '[slug]',
})
export class WorkspaceCreateCommand extends CommandRunner {
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
      slug = await this.promptService.input('Workspace slug');
    }

    const name = (options?.name as string | undefined) ?? undefined;

    const input = WorkspaceCreateInputSchema.parse({ slug, name });
    const result = this.workspaceService.create(input);
    const output = WorkspaceCreateOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Optional human-readable display name',
  })
  parseName(value: string): string {
    return value;
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
