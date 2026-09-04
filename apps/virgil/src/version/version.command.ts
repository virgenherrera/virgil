import { Command, CommandRunner, Option } from 'nest-commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';
import { VersionOutputSchema } from './version.schemas.js';

function getAppVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

@Command({
  name: 'version',
  description: 'Print the Virgil TUI version and exit.',
})
export class VersionCommand extends CommandRunner {
  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const opts = JsonOptionSchema.parse(options ?? {});
    const version = getAppVersion();
    const output = VersionOutputSchema.parse({ version });
    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
