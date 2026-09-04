import { Command, CommandRunner } from 'nest-commander';
import { ProviderAddCommand } from './provider-add.command.js';
import { ProviderListCommand } from './provider-list.command.js';
import { ProviderTestCommand } from './provider-test.command.js';
import { ProviderRemoveCommand } from './provider-remove.command.js';

@Command({
  name: 'provider',
  description: 'Manage workspace providers (add, list, test, remove).',
  subCommands: [
    ProviderAddCommand,
    ProviderListCommand,
    ProviderTestCommand,
    ProviderRemoveCommand,
  ],
})
export class ProviderCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
