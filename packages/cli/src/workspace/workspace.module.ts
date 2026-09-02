import { Module } from '@nestjs/common';
import { WorkspaceCreateCommand } from './commands/workspace-create.command.js';
import { WorkspaceDeleteCommand } from './commands/workspace-delete.command.js';
import { WorkspaceListCommand } from './commands/workspace-list.command.js';
import { WorkspaceSelectCommand } from './commands/workspace-select.command.js';
import { WorkspaceShowCommand } from './commands/workspace-show.command.js';
import { WorkspaceCommand } from './commands/workspace.command.js';
import { StateDirectoryService } from './state-directory.service.js';
import { WorkspaceFsService } from './workspace-fs.service.js';
import { WorkspaceService } from './workspace.service.js';

/**
 * Hosts the workspace and configuration layer (H03): state directory
 * resolution, workspace CRUD, provider/repo registration, and the
 * `virgil workspace *` CLI commands. Imported by `AppModule`.
 */
@Module({
  providers: [
    StateDirectoryService,
    WorkspaceFsService,
    WorkspaceService,
    WorkspaceCommand,
    WorkspaceCreateCommand,
    WorkspaceListCommand,
    WorkspaceSelectCommand,
    WorkspaceShowCommand,
    WorkspaceDeleteCommand,
  ],
  exports: [WorkspaceService, WorkspaceFsService, StateDirectoryService],
})
export class WorkspaceModule {}
