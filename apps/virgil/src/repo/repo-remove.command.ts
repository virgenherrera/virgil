import { CommandRunner, SubCommand } from 'nest-commander';
import { printTbdStub } from '../shared/tbd-stub.util.js';

@SubCommand({
  name: 'remove',
  description: 'Remove a repository from the workspace.',
})
export class RepoRemoveCommand extends CommandRunner {
  async run(): Promise<void> {
    printTbdStub(
      'repo remove',
      'GAP-002',
      'WorkspaceService.removeRepo pending',
    );
  }
}
