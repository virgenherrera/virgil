import { CommandRunner, SubCommand } from 'nest-commander';
import { WorkspaceService } from '../workspace.service.js';

@SubCommand({
  name: 'list',
  description: 'List all Virgil workspaces, marking the active one.',
})
export class WorkspaceListCommand extends CommandRunner {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  async run(): Promise<void> {
    const workspaces = await this.workspaceService.listWorkspaces();

    if (workspaces.length === 0) {
      console.log(
        'No workspaces found. Create one with "virgil workspace create <slug>".',
      );
      return;
    }

    for (const { metadata, active } of workspaces) {
      const marker = active ? '*' : ' ';
      const label = metadata.displayName
        ? `${metadata.slug} (${metadata.displayName})`
        : metadata.slug;
      console.log(`${marker} ${label}`);
    }
  }
}
