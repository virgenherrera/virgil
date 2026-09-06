import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DIR_NAME = 'virgil';

export interface StateDirectoryContext {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
}

export function defaultStateDirectoryContext(): StateDirectoryContext {
  return {
    env: process.env,
    platform: process.platform,
    homeDir: homedir(),
  };
}

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

export async function ensureStateRoot(
  context: StateDirectoryContext = defaultStateDirectoryContext(),
): Promise<string> {
  const root = resolveStateRoot(context);
  await mkdir(root, { recursive: true });
  return root;
}
