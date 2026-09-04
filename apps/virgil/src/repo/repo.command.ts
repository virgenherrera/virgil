import { Command, CommandRunner } from 'nest-commander';
import { RepoAddCommand } from './repo-add.command.js';
import { RepoListCommand } from './repo-list.command.js';
import { RepoShowCommand } from './repo-show.command.js';
import { RepoRemoveCommand } from './repo-remove.command.js';

@Command({
  name: 'repo',
  description: 'Manage workspace repositories (add, list, show, remove).',
  subCommands: [
    RepoAddCommand,
    RepoListCommand,
    RepoShowCommand,
    RepoRemoveCommand,
  ],
})
export class RepoCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
