import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DIR_NAME = 'virgil';

/**
 * Inputs governing where the Virgil runtime state root resolves to. Every
 * field is optional so callers can override only what a given test case
 * cares about; `defaultStateDirectoryContext()` supplies the real values
 * for normal (non-test) execution.
 */
export interface StateDirectoryContext {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
}

/** Captures the real process environment, platform, and home directory. */
export function defaultStateDirectoryContext(): StateDirectoryContext {
  return {
    env: process.env,
    platform: process.platform,
    homeDir: homedir(),
  };
}

/**
 * Resolves the Virgil runtime state root directory following platform
 * conventions, in priority order:
 *
 *   1. `VIRGIL_STATE_DIR` environment variable (explicit override)
 *   2. macOS: `~/Library/Application Support/virgil`
 *   3. Windows: `%LOCALAPPDATA%\virgil`, falling back to `~/.virgil`
 *   4. Linux/other: `$XDG_DATA_HOME/virgil`, falling back to `~/.virgil`
 *
 * This function never reads or derives from `process.execPath` or any
 * installation-relative path: a Node SEA binary must resolve the same
 * state root regardless of where the executable itself lives. It is a
 * pure utility with no NestJS decorator dependencies, so it can be reused
 * by any package (or a future non-Nest entry point) without pulling in
 * the DI container.
 */
export function resolveStateRoot(
  context: StateDirectoryContext = defaultStateDirectoryContext(),
): string {
  const override = context.env.VIRGIL_STATE_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }

  if (context.platform === 'darwin') {
    return join(
      context.homeDir,
      'Library',
      'Application Support',
      APP_DIR_NAME,
    );
  }

  if (context.platform === 'win32') {
    const localAppData = context.env.LOCALAPPDATA;
    if (localAppData && localAppData.trim().length > 0) {
      return join(localAppData, APP_DIR_NAME);
    }
    return join(context.homeDir, `.${APP_DIR_NAME}`);
  }

  const xdgDataHome = context.env.XDG_DATA_HOME;
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, APP_DIR_NAME);
  }

  return join(context.homeDir, `.${APP_DIR_NAME}`);
}

/**
 * Resolves the state root (see {@link resolveStateRoot}) and ensures the
 * directory exists on disk, creating it (and any missing parents) on
 * first access.
 */
export async function ensureStateRoot(
  context: StateDirectoryContext = defaultStateDirectoryContext(),
): Promise<string> {
  const root = resolveStateRoot(context);
  await mkdir(root, { recursive: true });
  return root;
}
