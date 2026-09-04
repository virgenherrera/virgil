import { CommandRunner, SubCommand } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'remove',
  description: 'Remove a provider from the workspace.',
})
export class ProviderRemoveCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'provider remove',
      'GAP-003',
      'WorkspaceService.removeProvider pending',
    );
  }
}
