import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';
import type { SupportedBrowser } from './browser-config-schema.js';

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

export interface ResolvedBrowserType {
  readonly engine: BrowserEngine;
  readonly channel?: string;
  readonly isChromiumBased: boolean;
}

const ENGINE_BY_BROWSER: Record<SupportedBrowser, ResolvedBrowserType> = {
  chrome: { engine: 'chromium', channel: 'chrome', isChromiumBased: true },
  edge: { engine: 'chromium', channel: 'msedge', isChromiumBased: true },
  firefox: { engine: 'firefox', isChromiumBased: false },
  safari: { engine: 'webkit', isChromiumBased: false },
};

const DEFAULT_PROFILE_DIR_BY_BROWSER: Record<SupportedBrowser, string> = {
  chrome: '.virgil/chrome-data',
  edge: '.virgil/edge-data',
  firefox: '.virgil/firefox-data',
  safari: '.virgil/safari-data',
};

/** Default Chromium launch arguments reducing automation-detection friction. */
export const DEFAULT_CHROMIUM_LAUNCH_ARGS: readonly string[] = [
  '--no-first-run',
  '--hide-crash-restore-bubble',
  '--disable-features=IsolateOrigins,site-per-process',
];

/** Stale lock/session artifacts left behind by an unclean Chromium-based browser shutdown. */
export const STALE_LOCK_FILES: readonly string[] = [
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
];

export const STALE_SESSION_DIR = 'Sessions';

/** Maps a configured browser name to its Playwright engine and channel. */
export function resolveBrowserType(
  browser: SupportedBrowser,
): ResolvedBrowserType {
  return ENGINE_BY_BROWSER[browser];
}

/** Expands a leading `~` to the current user's home directory. */
export function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }

  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }

  return path;
}

/** Resolves the effective, `~`-expanded profile directory for a browser configuration. */
export function resolveProfilePath(
  browser: SupportedBrowser,
  profilePath?: string,
): string {
  const raw = profilePath ?? join('~', DEFAULT_PROFILE_DIR_BY_BROWSER[browser]);
  const expanded = expandHome(raw);

  return isAbsolute(expanded) ? expanded : join(homedir(), expanded);
}

/**
 * Removes stale lock files and the `Sessions/` directory that would
 * otherwise cause "browser already in use" launch failures after an
 * unclean shutdown. Only applicable to Chromium-based profiles; a no-op
 * for Firefox and WebKit profiles.
 */
export async function cleanStaleLocks(profilePath: string): Promise<string[]> {
  const removed: string[] = [];

  try {
    await stat(profilePath);
  } catch {
    return removed;
  }

  const entries = await readdir(profilePath).catch(() => [] as string[]);
  const targets = [...STALE_LOCK_FILES, STALE_SESSION_DIR];

  for (const target of targets) {
    if (!entries.includes(target)) {
      continue;
    }

    const targetPath = join(profilePath, target);
    await rm(targetPath, { recursive: true, force: true });
    removed.push(target);
  }

  return removed;
}
