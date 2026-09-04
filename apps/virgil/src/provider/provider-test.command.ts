import { CommandRunner, SubCommand } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'test',
  description: 'Test a provider connection.',
})
export class ProviderTestCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'provider test',
      'GAP-003',
      'WorkspaceService.testProvider pending',
    );
  }
}
