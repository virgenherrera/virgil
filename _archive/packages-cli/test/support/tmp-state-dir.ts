import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test-only helper: points `VIRGIL_STATE_DIR` at a fresh temporary
 * directory for the duration of a test, then tears it down. Keeps every
 * workspace e2e test isolated from the developer's real `~/.virgil` (or
 * platform-equivalent) state and from other test files (Vitest's default
 * `threads` pool gives each test file its own `process.env` copy).
 */
export interface TmpStateDirHandle {
  readonly path: string;
  cleanup(): Promise<void>;
}

export async function useTmpStateDir(): Promise<TmpStateDirHandle> {
  const path = await mkdtemp(join(tmpdir(), 'virgil-ws-test-'));
  const previous = process.env.VIRGIL_STATE_DIR;
  process.env.VIRGIL_STATE_DIR = path;

  return {
    path,
    async cleanup() {
      await rm(path, { recursive: true, force: true });
      if (previous === undefined) {
        delete process.env.VIRGIL_STATE_DIR;
      } else {
        process.env.VIRGIL_STATE_DIR = previous;
      }
    },
  };
}
