'use strict';

/**
 * SEA-aware native addon loader (W3 in
 * handoffs/H02_CLI_RUNTIME_SEA.md#sea-workarounds-reference), activated by
 * H06 for `better-sqlite3`.
 *
 * A native addon's own binding loader typically resolves the compiled
 * `.node` file relative to the source package's `__dirname`, which does
 * not exist as a real filesystem path once code is loaded from inside a
 * SEA binary (everything is bundled into one `.cjs` file, so `__dirname`
 * inside the bundle resolves to the bundle's own directory, not
 * `node_modules/better-sqlite3/...`). `process.dlopen()` still requires a
 * real file on disk, so the `.node` file must be co-located with the
 * binary (`scripts/build-sea.mjs`, stage 4b) and re-resolved here.
 *
 * This module replaces `better-sqlite3/lib/binding.js` at bundle time
 * (see the `native-addon-shim` esbuild plugin in `build-sea.mjs`). It must
 * match that file's exact call signature: `better-sqlite3/lib/index.js`
 * does `require('./database')(require('./binding').getBinding, true)` and
 * `database.js` invokes the resulting function as `getBinding(nativeBinding)`
 * — a single argument, `undefined` in the default (non-test-injection)
 * case. This shim resolves the target file name itself instead of relying
 * on a caller-supplied name.
 *
 * Resolution order:
 * 1. Co-located with the running executable (`process.execPath`) — the SEA
 *    binary deployment scenario.
 * 2. Co-located with this shim's own directory — the bundled/development
 *    scenario (e.g. `pnpm start:prod`, `pnpm link --global`).
 * 3. The real `better-sqlite3` prebuild inside `node_modules`, resolved
 *    relative to this shim's own directory — a safety net for any
 *    non-SEA esbuild bundle that still routes through this shim.
 */
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');

let cachedAddon;

/** Mirrors `better-sqlite3/lib/binding.js`'s own prebuild target naming. */
function addonTargetName() {
  const isLinuxMusl =
    process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
  const platform = isLinuxMusl ? 'linuxmusl' : process.platform;
  return `${platform}-${process.arch}.node`;
}

/**
 * @param {string | object | undefined} nativeBinding
 * @returns {object} the loaded native addon exports.
 */
function getBinding(nativeBinding) {
  if (typeof nativeBinding === 'string') {
    return require(path.resolve(nativeBinding).replace(/(\.node)?$/, '.node'));
  }

  if (typeof nativeBinding === 'object' && nativeBinding !== null) {
    return nativeBinding;
  }

  if (cachedAddon) {
    return cachedAddon;
  }

  const addonName = addonTargetName();
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

  // Safety net: resolve the real package's prebuild directly. `exports` in
  // better-sqlite3's package.json does not expose raw `.node` files under
  // `./prebuilds/*`, but it does expose `./package.json`, and plain `fs`
  // access (unlike `require`) is never subject to the exports map.
  try {
    const req = createRequire(__filename);
    const packageJsonPath = req.resolve('better-sqlite3/package.json');
    const fallback = path.join(path.dirname(packageJsonPath), 'prebuilds', addonName);
    if (fs.existsSync(fallback)) {
      cachedAddon = req(fallback);
      return cachedAddon;
    }
  } catch {
    // fall through to the error below
  }

  throw new Error(
    `Cannot find native addon "${addonName}". Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}

exports.getBinding = getBinding;
