import { Module } from '@nestjs/common';
import { ProviderRegistryModule } from '../contracts/provider-registry.module.js';
import { SharedModule } from '../shared/shared.module.js';
import { KnowledgeAdapterFactory } from './knowledge-adapter.factory.js';
import { FetchHttpClient } from './knowledge-http-client.js';
import { HTTP_CLIENT, CDP_SESSION } from './knowledge.constants.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeCommand } from './knowledge.command.js';
import { KnowledgeSearchCommand } from './knowledge-search.command.js';
import { KnowledgeStatsCommand } from './knowledge-stats.command.js';
import { KnowledgeCompactCommand } from './knowledge-compact.command.js';
import { KnowledgeAddCommand } from './knowledge-add.command.js';
import { KnowledgeListCommand } from './knowledge-list.command.js';
import { KnowledgeRemoveCommand } from './knowledge-remove.command.js';

@Module({
  imports: [SharedModule, ProviderRegistryModule],
  providers: [
    KnowledgeAdapterFactory,
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
    { provide: CDP_SESSION, useValue: null },
    KnowledgeService,
    KnowledgeCommand,
    KnowledgeSearchCommand,
    KnowledgeStatsCommand,
    KnowledgeCompactCommand,
    KnowledgeAddCommand,
    KnowledgeListCommand,
    KnowledgeRemoveCommand,
  ],
  exports: [KnowledgeAdapterFactory, HTTP_CLIENT, CDP_SESSION],
})
export class KnowledgeModule {}
