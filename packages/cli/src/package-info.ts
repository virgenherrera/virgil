import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  version: string;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(currentDir, '../package.json');

/**
 * Reads the CLI's own `package.json#version` from disk.
 *
 * Reading from disk (rather than importing the JSON module) keeps the
 * compiled `dist/` output path-relative and avoids bundler-specific JSON
 * import handling.
 */
export function getCliVersion(): string {
  const manifest = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageManifest;

  return manifest.version;
}
