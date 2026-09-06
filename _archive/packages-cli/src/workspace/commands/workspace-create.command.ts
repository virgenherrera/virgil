import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { WorkspaceService } from '../workspace.service.js';

interface CreateWorkspaceOptions {
  readonly name?: string;
}

@SubCommand({
  name: 'create',
  description: 'Create a new Virgil workspace.',
  arguments: '<slug>',
  argsDescription: {
    slug: 'Filesystem-safe workspace identifier (e.g. acme-corp).',
  },
})
export class WorkspaceCreateCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Optional human-readable display name.',
  })
  parseName(value: string): string {
    return value;
  }

  async run(
    passedParams: string[],
    options?: CreateWorkspaceOptions,
  ): Promise<void> {
    const [slug] = passedParams;
    if (!slug) {
      console.error(
        'Error: a workspace slug is required. Usage: virgil workspace create <slug>',
      );
      process.exitCode = 1;
      return;
    }

    try {
      const metadata = await this.workspaceService.createWorkspace(
        slug,
        options?.name,
      );
      const label = metadata.displayName
        ? `${metadata.slug} (${metadata.displayName})`
        : metadata.slug;
      console.log(`Created workspace "${label}".`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}
