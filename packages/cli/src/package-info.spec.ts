import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliVersion } from './package-info.js';

describe('getCliVersion', () => {
  it('returns the version declared in package.json', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = resolve(currentDir, '../package.json');
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      version: string;
    };

    expect(getCliVersion()).toBe(manifest.version);
  });
});
