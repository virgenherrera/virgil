import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runtime isolation adversarial proof for the Virgil CLI SEA binary.
 *
 * Validates seed DoD items 24, 25, 26 (see
 * handoffs/H02_CLI_RUNTIME_SEA.md#d5--runtime-isolation-proof):
 *
 * - The SEA binary executes from inside a fixture repository declaring a
 *   legacy (Node 12) runtime, without depending on that runtime.
 * - The SEA binary ignores a poisoned `node` shim placed first on PATH.
 * - The SEA binary never mutates any file in the target repository fixture.
 *
 * `beforeAll` runs the full SEA build pipeline (scripts/build-sea.mjs) so
 * this spec is self-contained under `pnpm test:dynamic` and does not
 * silently pass against a stale, previously-built binary.
 */

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, '..');
const fixtureDir = join(testDir, 'fixtures', 'legacy-repo');
const poisonedNodeShim = join(fixtureDir, 'node');
const binaryName = process.platform === 'win32' ? 'virgil.exe' : 'virgil';
const binaryPath = join(packageRoot, 'artifacts', binaryName);

const FIXTURE_FILES = [
  '.nvmrc',
  '.node-version',
  'package.json',
  'node',
] as const;
const SEA_BUILD_TIMEOUT_MS = 180_000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function fixtureChecksums(): Record<string, string> {
  const checksums: Record<string, string> = {};

  for (const file of FIXTURE_FILES) {
    const content = readFileSync(join(fixtureDir, file));
    checksums[file] = createHash('sha256').update(content).digest('hex');
  }

  return checksums;
}

describe('SEA runtime isolation', () => {
  beforeAll(() => {
    chmodSync(poisonedNodeShim, 0o755);

    execFileSync(
      process.execPath,
      [join(packageRoot, 'scripts', 'build-sea.mjs')],
      {
        cwd: packageRoot,
        stdio: 'inherit',
      },
    );
  }, SEA_BUILD_TIMEOUT_MS);

  it('produces an executable SEA binary', () => {
    expect(existsSync(binaryPath)).toBe(true);
  });

  it('control: the poisoned node shim fires when invoked directly', () => {
    expect(() =>
      execFileSync(poisonedNodeShim, [], { stdio: 'pipe' }),
    ).toThrowError();

    try {
      execFileSync(poisonedNodeShim, [], { stdio: 'pipe' });
    } catch (error) {
      const stderr = (error as { stderr: Buffer }).stderr.toString();
      expect(stderr).toContain('POISONED NODE INVOKED');
    }
  });

  it('executes a trivial command from inside a legacy-runtime fixture (Node 12 declared)', () => {
    const output = execFileSync(binaryPath, ['version'], {
      cwd: fixtureDir,
      encoding: 'utf-8',
    });

    expect(output.trim()).toMatch(VERSION_PATTERN);
  });

  it('ignores a poisoned node shim placed first on PATH', () => {
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const poisonedPath = `${fixtureDir}${pathSeparator}${process.env.PATH ?? ''}`;

    const output = execFileSync(binaryPath, ['version'], {
      cwd: fixtureDir,
      encoding: 'utf-8',
      env: { ...process.env, PATH: poisonedPath },
    });

    expect(output).not.toContain('POISONED NODE INVOKED');
    expect(output.trim()).toMatch(VERSION_PATTERN);
  });

  it('never mutates the target repository fixture', () => {
    const entriesBefore = readdirSync(fixtureDir).sort();
    const checksumsBefore = fixtureChecksums();

    execFileSync(binaryPath, ['version'], { cwd: fixtureDir });

    const entriesAfter = readdirSync(fixtureDir).sort();
    const checksumsAfter = fixtureChecksums();

    expect(entriesAfter).toEqual(entriesBefore);
    expect(checksumsAfter).toEqual(checksumsBefore);
  });
});
