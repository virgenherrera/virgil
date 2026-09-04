import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { WorkspaceService } from './workspace.service.js';
import { WorkspaceCommand } from './workspace.command.js';
import { WorkspaceCreateCommand } from './workspace-create.command.js';
import { WorkspaceListCommand } from './workspace-list.command.js';
import { WorkspaceSelectCommand } from './workspace-select.command.js';
import { WorkspaceShowCommand } from './workspace-show.command.js';
import { WorkspaceDeleteCommand } from './workspace-delete.command.js';

@Module({
  imports: [SharedModule],
  providers: [
    WorkspaceService,
    WorkspaceCommand,
    WorkspaceCreateCommand,
    WorkspaceListCommand,
    WorkspaceSelectCommand,
    WorkspaceShowCommand,
    WorkspaceDeleteCommand,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
