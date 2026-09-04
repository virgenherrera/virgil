import { SubCommand, CommandRunner } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'remove',
  description: 'Remove a knowledge source (redirects to provider remove).',
})
export class KnowledgeRemoveCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'knowledge remove',
      'TBD',
      'Use "virgil provider remove" to unregister sources',
    );
  }
}
