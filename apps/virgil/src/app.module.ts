import { Module } from '@nestjs/common';
import { VersionModule } from './version/version.module.js';
import { InitModule } from './init/init.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { RepoModule } from './repo/repo.module.js';
import { ProviderModule } from './provider/provider.module.js';
import { GovernanceModule } from './governance/governance.module.js';

@Module({
  imports: [
    VersionModule,
    InitModule,
    WorkspaceModule,
    KnowledgeModule,
    RepoModule,
    ProviderModule,
    GovernanceModule,
  ],
})
export class AppModule {}
