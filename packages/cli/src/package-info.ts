import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  version: string;
}

/**
 * Reads the CLI's own `package.json#version`.
 *
 * Two resolution strategies are required:
 * - Normal Node runtime (dev, `pnpm link --global`, `start:prod`): read
 *   `package.json` from disk, located relative to this module's own file
 *   via `import.meta.url`.
 * - SEA binary: once esbuild bundles this module to CJS for SEA packaging,
 *   `import.meta.url` is unavailable (empty), and there is no on-disk
 *   `package.json` next to the binary. `package.json` is instead embedded
 *   as a SEA asset at build time (see `sea-config.json#assets`) and read
 *   back here through the `node:sea` `getAsset()` API.
 *
 * `import.meta.url` is only evaluated inside the non-SEA branch: evaluating
 * it unconditionally at module scope would throw once bundled to CJS, even
 * when `isSea()` is true.
 */
export function getCliVersion(): string {
  if (isSea()) {
    const manifest = JSON.parse(
      getAsset('package.json', 'utf-8'),
    ) as PackageManifest;
    return manifest.version;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(currentDir, '../package.json');
  const manifest = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageManifest;

  return manifest.version;
}
