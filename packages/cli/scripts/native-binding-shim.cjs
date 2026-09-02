'use strict';

/**
 * SEA-aware native addon loader (W3 in
 * handoffs/H02_CLI_RUNTIME_SEA.md#sea-workarounds-reference).
 *
 * Status: prepared infrastructure, not yet activated. `packages/cli` does
 * not currently depend on any native (`.node`) addon -- SQLite persistence
 * via `better-sqlite3` is scoped to H06. The esbuild plugin in
 * scripts/build-sea.mjs that would route requests through this shim only
 * matches when a `better-sqlite3` package is present in the dependency
 * graph, so this file is inert until H06 introduces that dependency.
 *
 * The pattern is codified now so H06 does not have to rediscover it: a
 * native addon's own binding loader typically resolves the compiled
 * `.node` file relative to the source package's `__dirname`, which does not
 * exist as a real filesystem path once code is loaded from inside a SEA
 * binary. `process.dlopen()` still requires a real file on disk, so the
 * `.node` file must be co-located with the binary and re-resolved here.
 *
 * Resolution order:
 * 1. Co-located with the running executable (`process.execPath`) -- the SEA
 *    binary deployment scenario.
 * 2. Co-located with this shim's own directory -- the bundled/development
 *    scenario (e.g. `pnpm start:prod`, `pnpm link --global`).
 * 3. A caller-provided explicit path or object, if given.
 */
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');

let cachedAddon;

/**
 * @param {string | object | undefined} nativeBinding
 * @param {string} addonName base filename of the compiled `.node` addon,
 *   e.g. `better_sqlite3.node`.
 * @returns {object} the loaded native addon exports.
 */
function getBinding(nativeBinding, addonName) {
  if (typeof nativeBinding === 'string') {
    return require(path.resolve(nativeBinding).replace(/(\.node)?$/, '.node'));
  }

  if (typeof nativeBinding === 'object' && nativeBinding !== null) {
    return nativeBinding;
  }

  if (cachedAddon) {
    return cachedAddon;
  }

  const candidates = [
    path.join(path.dirname(process.execPath), addonName),
    path.join(__dirname, addonName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const req = createRequire(candidate);
      cachedAddon = req(candidate);
      return cachedAddon;
    }
  }

  throw new Error(
    `Cannot find native addon "${addonName}". Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}

exports.getBinding = getBinding;
