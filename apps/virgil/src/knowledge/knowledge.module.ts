import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeCommand } from './knowledge.command.js';
import { KnowledgeSearchCommand } from './knowledge-search.command.js';
import { KnowledgeStatsCommand } from './knowledge-stats.command.js';
import { KnowledgeCompactCommand } from './knowledge-compact.command.js';
import { KnowledgeAddCommand } from './knowledge-add.command.js';
import { KnowledgeListCommand } from './knowledge-list.command.js';
import { KnowledgeRemoveCommand } from './knowledge-remove.command.js';

@Module({
  imports: [SharedModule],
  providers: [
    KnowledgeService,
    KnowledgeCommand,
    KnowledgeSearchCommand,
    KnowledgeStatsCommand,
    KnowledgeCompactCommand,
    KnowledgeAddCommand,
    KnowledgeListCommand,
    KnowledgeRemoveCommand,
  ],
})
export class KnowledgeModule {}
