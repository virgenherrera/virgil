import { Command, CommandRunner } from 'nest-commander';
import { getCliVersion } from '../package-info.js';

@Command({
  name: 'version',
  description: 'Print the Virgil CLI version and exit.',
})
export class VersionCommand extends CommandRunner {
  async run(_passedParams: string[]): Promise<void> {
    console.log(getCliVersion());
  }
}
