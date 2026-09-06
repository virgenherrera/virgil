import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { CodeGraphService } from './codegraph.service.js';
import { LocalRepoProviderFactory } from './local-repo-provider.factory.js';
import { RepoCommand } from './repo.command.js';
import { RepoAddCommand } from './repo-add.command.js';
import { RepoListCommand } from './repo-list.command.js';
import { RepoShowCommand } from './repo-show.command.js';
import { RepoRemoveCommand } from './repo-remove.command.js';
import { RepoService } from './repo.service.js';

@Module({
  imports: [SharedModule],
  providers: [
    LocalRepoProviderFactory,
    CodeGraphService,
    RepoService,
    RepoCommand,
    RepoAddCommand,
    RepoListCommand,
    RepoShowCommand,
    RepoRemoveCommand,
  ],
  exports: [LocalRepoProviderFactory, CodeGraphService],
})
export class RepoModule {}
