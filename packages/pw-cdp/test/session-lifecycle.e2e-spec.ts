import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  SessionManager,
  cleanStaleLocks,
  expandHome,
  resolveProfilePath,
  type BrowserConfig,
} from '../src/index.js';
import {
  createFakeContext,
  createFakePage,
} from './support/mock-playwright.js';

vi.mock('playwright', async () => {
  const mock = await import('./support/mock-playwright.js');

  return mock.createPlaywrightModule();
});

describe('SessionManager lifecycle (public API)', () => {
  let profileDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileDir = await mkdtemp(join(tmpdir(), 'virgil-pw-cdp-'));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it('discovers browsers whose executables resolve on this machine', () => {
    const manager = new SessionManager();
    const available = manager.discoverAvailableBrowsers();

    // The mocked chromium and firefox launchers resolve; webkit throws.
    expect(available).toContain('chrome');
    expect(available).toContain('edge');
    expect(available).toContain('firefox');
    expect(available).not.toContain('safari');
  });

  it('creates a session, locks the profile, and rejects a concurrent session for the same profile', async () => {
    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockResolvedValue(
      createFakeContext(createFakePage()),
    );

    const manager = new SessionManager();
    const config: BrowserConfig = {
      browser: 'chrome',
      profilePath: profileDir,
      headless: true,
      launchArgs: [],
    };

    const session = await manager.createSession(config);

    expect(manager.isLocked(profileDir)).toBe(true);
    await expect(manager.createSession(config)).rejects.toMatchObject({
      code: 'BROWSER_LAUNCH_ERROR',
    });

    await manager.detachSession(session);
    expect(manager.isLocked(profileDir)).toBe(false);
  });

  it('cleans stale Chromium lock files before launching a new session', async () => {
    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockResolvedValue(
      createFakeContext(createFakePage()),
    );

    await writeFile(join(profileDir, 'SingletonLock'), '');
    await writeFile(join(profileDir, 'SingletonCookie'), '');
    await writeFile(join(profileDir, 'SingletonSocket'), '');
    await mkdir(join(profileDir, 'Sessions'));
    await writeFile(join(profileDir, 'Sessions', 'stale-session.json'), '{}');

    const manager = new SessionManager();

    await manager.createSession({
      browser: 'chrome',
      profilePath: profileDir,
      headless: true,
      launchArgs: [],
    });

    const remaining = await readdir(profileDir);
    expect(remaining).not.toContain('SingletonLock');
    expect(remaining).not.toContain('SingletonCookie');
    expect(remaining).not.toContain('SingletonSocket');
    expect(remaining).not.toContain('Sessions');
  });

  it('wraps a launch failure in a BrowserLaunchError', async () => {
    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockRejectedValueOnce(
      new Error('spawn ENOENT'),
    );

    const manager = new SessionManager();

    await expect(
      manager.createSession({
        browser: 'chrome',
        profilePath: profileDir,
        headless: true,
        launchArgs: [],
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_LAUNCH_ERROR' });
  });

  it('creates a fresh page when the persistent context opens with none', async () => {
    const page = createFakePage();
    const context = createFakeContext(page);
    (context.pages as Mock).mockReturnValue([]);

    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockResolvedValueOnce(context);

    const manager = new SessionManager();
    const session = await manager.createSession({
      browser: 'chrome',
      profilePath: profileDir,
      headless: true,
      launchArgs: [],
    });

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(session.page).toBe(page);
  });

  it('resolves default, `~`-expanded profile paths per browser', () => {
    expect(resolveProfilePath('firefox')).toBe(
      join(homedir(), '.virgil', 'firefox-data'),
    );
    expect(expandHome('~')).toBe(homedir());
    expect(expandHome('~/custom-profile')).toBe(
      join(homedir(), 'custom-profile'),
    );
    expect(expandHome('/already/absolute')).toBe('/already/absolute');
  });

  it('cleanStaleLocks is a no-op for a profile directory that does not exist yet', async () => {
    const removed = await cleanStaleLocks(join(profileDir, 'does-not-exist'));

    expect(removed).toEqual([]);
  });
});
