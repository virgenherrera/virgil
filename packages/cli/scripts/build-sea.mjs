#!/usr/bin/env node
/**
 * SEA (Single Executable Application) build pipeline for the Virgil CLI.
 *
 * Stages (see handoffs/H02_CLI_RUNTIME_SEA.md#sea-build-pipeline):
 *   1. tsc type check + emit          (delegated to `pnpm run build`)
 *   2. esbuild CJS bundle             (sea-entry.mjs -> artifacts/sea/bundle.cjs)
 *   3. node --experimental-sea-config (artifacts/sea/bundle.cjs -> sea-prep.blob)
 *   4. copy the platform Node binary
 *   5. postject blob injection
 *   6. platform codesigning (macOS ad-hoc; skipped elsewhere)
 *
 * Output: packages/cli/artifacts/virgil[.exe], self-contained aside from a
 * co-located native addon requirement documented in W3 (currently inert --
 * see scripts/native-binding-shim.cjs).
 *
 * Invoke via `pnpm --filter @virgil/cli build:sea` (or `pnpm build:sea` from
 * inside packages/cli/).
 */
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const seaOutDir = join(packageRoot, 'artifacts', 'sea');
const bundlePath = join(seaOutDir, 'bundle.cjs');
const blobPath = join(seaOutDir, 'sea-prep.blob');
const seaConfigPath = join(packageRoot, 'sea-config.json');
const binaryName = process.platform === 'win32' ? 'virgil.exe' : 'virgil';
const binaryPath = join(packageRoot, 'artifacts', binaryName);

/**
 * Runs a child process, streaming its output, from the package root.
 *
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: packageRoot });
}

/**
 * @param {string} step
 * @param {string} message
 */
function log(step, message) {
  console.log(`[${step}] ${message}`);
}

/**
 * W3 -- native addon shim plugin (prepared, currently inert).
 *
 * Intercepts a native addon package's relative `./binding` require and
 * rewrites it to the SEA-aware shim in native-binding-shim.cjs. The filter
 * only matches when the resolve directory belongs to `better-sqlite3`,
 * which is not yet a dependency of this package (deferred to H06) -- so
 * this plugin is a documented no-op today.
 *
 * @type {import('esbuild').Plugin}
 */
const nativeAddonShimPlugin = {
  name: 'native-addon-shim',
  setup(build) {
    build.onResolve({ filter: /\.\/binding$/ }, (args) => {
      if (args.resolveDir.includes('better-sqlite3')) {
        return { path: join(currentDir, 'native-binding-shim.cjs') };
      }
      return undefined;
    });
  },
};

async function main() {
  console.log('=== Virgil CLI -- SEA build ===');
  console.log(`Package root: ${packageRoot}`);
  console.log(`Platform: ${process.platform}-${process.arch}`);
  console.log(`Node: ${process.version}`);
  console.log('');

  mkdirSync(seaOutDir, { recursive: true });

  // Stage 1 -- TypeScript compilation (type check + emit)
  log('1/6', 'Compiling TypeScript (pnpm run build)...');
  run('pnpm', ['run', 'build']);

  const compiledEntry = join(packageRoot, 'dist', 'app.module.js');
  if (!existsSync(compiledEntry)) {
    throw new Error(
      `Expected compiled output at ${compiledEntry} after "pnpm run build"; SEA bundling cannot proceed.`,
    );
  }

  // Stage 2 -- esbuild CJS bundle (W1, W3, W4)
  log('2/6', 'Bundling with esbuild (CJS format, SEA workarounds applied)...');

  const buildResult = await esbuild.build({
    entryPoints: [join(packageRoot, 'sea-entry.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs', // W1 -- CJS required on Node 24; ESM SEA lands in Node 25+
    outfile: bundlePath,
    sourcemap: false,
    minify: false,
    keepNames: true, // preserves NestJS decorator metadata identifiers
    logLevel: 'info',
    // W4 -- NestJS optional peers this CLI never installs or uses
    external: [
      'class-validator',
      'class-transformer',
      '@nestjs/microservices',
      '@nestjs/microservices/microservices-module.js',
      '@nestjs/websockets',
      '@nestjs/websockets/socket-module.js',
      '@nestjs/platform-express',
    ],
    loader: { '.node': 'empty' },
    plugins: [nativeAddonShimPlugin],
    banner: { js: '/* Virgil CLI -- SEA bundle */' },
  });

  if (buildResult.errors.length > 0) {
    throw new Error('esbuild bundling failed for the SEA entry point.');
  }

  console.log(`Bundle created: ${bundlePath}`);

  // Stage 3 -- SEA blob generation
  log('3/6', 'Generating SEA blob (node --experimental-sea-config)...');
  run(process.execPath, ['--experimental-sea-config', seaConfigPath]);

  if (!existsSync(blobPath)) {
    throw new Error(`Expected SEA blob at ${blobPath} after blob generation.`);
  }

  // Stage 4 -- copy the platform Node binary as the SEA base executable
  log('4/6', `Copying the platform Node binary (${process.execPath})...`);
  mkdirSync(dirname(binaryPath), { recursive: true });
  copyFileSync(process.execPath, binaryPath);
  chmodSync(binaryPath, 0o755);

  // Stage 5 -- inject the SEA blob with postject
  log('5/6', 'Injecting the SEA blob with postject...');
  const postjectBin = resolve(
    packageRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'postject.cmd' : 'postject',
  );
  const postjectArgs = [
    binaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    '--overwrite',
  ];
  if (process.platform === 'darwin') {
    // macOS Mach-O binaries require an explicit segment name for the
    // injected blob section.
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }
  run(postjectBin, postjectArgs);

  // Stage 6 -- platform codesigning
  if (process.platform === 'darwin') {
    log('6/6', 'Code signing (macOS ad-hoc)...');
    run('codesign', ['--force', '--sign', '-', binaryPath]);
  } else {
    log('6/6', `Skipping code signing (not required on ${process.platform}).`);
  }

  const { size } = statSync(binaryPath);
  console.log('');
  console.log('=== SEA build complete ===');
  console.log(`Binary: ${binaryPath}`);
  console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB (${size} bytes)`);
  console.log('');
  console.log(`Run with: ${binaryPath} version`);
}

await main();
