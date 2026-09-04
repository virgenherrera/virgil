import { Command, CommandRunner } from 'nest-commander';
import { KnowledgeSearchCommand } from './knowledge-search.command.js';
import { KnowledgeStatsCommand } from './knowledge-stats.command.js';
import { KnowledgeCompactCommand } from './knowledge-compact.command.js';
import { KnowledgeAddCommand } from './knowledge-add.command.js';
import { KnowledgeListCommand } from './knowledge-list.command.js';
import { KnowledgeRemoveCommand } from './knowledge-remove.command.js';

@Command({
  name: 'knowledge',
  description: 'Search, inspect, and maintain the knowledge base.',
  subCommands: [
    KnowledgeSearchCommand,
    KnowledgeStatsCommand,
    KnowledgeCompactCommand,
    KnowledgeAddCommand,
    KnowledgeListCommand,
    KnowledgeRemoveCommand,
  ],
})
export class KnowledgeCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
