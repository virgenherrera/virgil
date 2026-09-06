import { CommandRunner, SubCommand } from 'nest-commander';
import { WorkspaceService } from '../workspace.service.js';

@SubCommand({
  name: 'select',
  description: 'Set the active Virgil workspace.',
  arguments: '<slug>',
})
export class WorkspaceSelectCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [slug] = passedParams;
    if (!slug) {
      console.error(
        'Error: a workspace slug is required. Usage: virgil workspace select <slug>',
      );
      process.exitCode = 1;
      return;
    }

    try {
      await this.workspaceService.selectWorkspace(slug);
      console.log(`Active workspace set to "${slug}".`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}
