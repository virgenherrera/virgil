import { SubCommand, CommandRunner } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'list',
  description: 'List knowledge sources (redirects to provider list).',
})
export class KnowledgeListCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'knowledge list',
      'TBD',
      'Use "virgil provider list" to see registered sources',
    );
  }
}
