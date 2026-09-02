import { CommandRunner, SubCommand } from 'nest-commander';
import { WorkspaceService } from '../workspace.service.js';

@SubCommand({
  name: 'delete',
  description: 'Delete a Virgil workspace and all of its registrations.',
  arguments: '<slug>',
})
export class WorkspaceDeleteCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [slug] = passedParams;
    if (!slug) {
      console.error(
        'Error: a workspace slug is required. Usage: virgil workspace delete <slug>',
      );
      process.exitCode = 1;
      return;
    }

    try {
      await this.workspaceService.deleteWorkspace(slug);
      console.log(`Deleted workspace "${slug}".`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}
