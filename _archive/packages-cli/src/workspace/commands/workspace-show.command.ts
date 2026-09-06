import { CommandRunner, SubCommand } from 'nest-commander';
import { WorkspaceService } from '../workspace.service.js';

@SubCommand({
  name: 'show',
  description:
    'Show details for a workspace (defaults to the active workspace).',
  arguments: '[slug]',
})
export class WorkspaceShowCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [slug] = passedParams;

    try {
      const details = await this.workspaceService.showWorkspace(slug);

      console.log(`Workspace: ${details.metadata.slug}`);
      if (details.metadata.displayName) {
        console.log(`Display name: ${details.metadata.displayName}`);
      }
      console.log(
        `Created: ${new Date(details.metadata.createdAt).toISOString()}`,
      );
      console.log(
        `Updated: ${new Date(details.metadata.updatedAt).toISOString()}`,
      );

      console.log(`Providers (${details.providers.length}):`);
      for (const provider of details.providers) {
        console.log(
          `  - [${provider.family}] ${provider.type} (${provider.enabled ? 'enabled' : 'disabled'})`,
        );
      }

      console.log(`Repositories (${details.repos.length}):`);
      for (const repo of details.repos) {
        console.log(`  - ${repo.alias ?? repo.path} (${repo.path})`);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}
