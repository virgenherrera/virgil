import { SubCommand, CommandRunner } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'add',
  description: 'Add a knowledge source (redirects to provider add).',
})
export class KnowledgeAddCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'knowledge add',
      'TBD',
      'Use "virgil provider add" to register knowledge sources',
    );
  }
}
