import { Command, CommandRunner } from 'nest-commander';
import { WorkspaceCreateCommand } from './workspace-create.command.js';
import { WorkspaceDeleteCommand } from './workspace-delete.command.js';
import { WorkspaceListCommand } from './workspace-list.command.js';
import { WorkspaceSelectCommand } from './workspace-select.command.js';
import { WorkspaceShowCommand } from './workspace-show.command.js';

@Command({
  name: 'workspace',
  description: 'Manage Virgil workspaces (create, list, select, show, delete).',
  subCommands: [
    WorkspaceCreateCommand,
    WorkspaceListCommand,
    WorkspaceSelectCommand,
    WorkspaceShowCommand,
    WorkspaceDeleteCommand,
  ],
})
export class WorkspaceCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(
      'Usage: virgil workspace <create|list|select|show|delete> [args]\n' +
        'Run "virgil workspace <subcommand> --help" for details.',
    );
  }
}
