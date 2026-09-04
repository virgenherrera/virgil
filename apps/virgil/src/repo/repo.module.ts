import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { RepoCommand } from './repo.command.js';
import { RepoAddCommand } from './repo-add.command.js';
import { RepoListCommand } from './repo-list.command.js';
import { RepoShowCommand } from './repo-show.command.js';
import { RepoRemoveCommand } from './repo-remove.command.js';
import { RepoService } from './repo.service.js';

@Module({
  imports: [SharedModule],
  providers: [
    RepoService,
    RepoCommand,
    RepoAddCommand,
    RepoListCommand,
    RepoShowCommand,
    RepoRemoveCommand,
  ],
})
export class RepoModule {}
