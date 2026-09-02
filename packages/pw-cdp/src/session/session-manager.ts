import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { chromium, firefox, webkit } from 'playwright';
import {
  BrowserLaunchError,
  SessionExpiredError,
} from '../errors/cdp-errors.js';
import type {
  BrowserConfig,
  SupportedBrowser,
} from './browser-config-schema.js';
import {
  DEFAULT_CHROMIUM_LAUNCH_ARGS,
  cleanStaleLocks,
  resolveBrowserType,
  resolveProfilePath,
} from './browser-resolver.js';

type PersistentContextLauncher = {
  launchPersistentContext(
    userDataDir: string,
    options: Record<string, unknown>,
  ): Promise<BrowserContext>;
};

const LAUNCHERS: Record<
  'chromium' | 'firefox' | 'webkit',
  PersistentContextLauncher
> = {
  chromium,
  firefox,
  webkit,
};

/** A live browser automation session: page, optional CDP session, and provenance. */
export interface CdpSessionHandle {
  readonly browser: SupportedBrowser;
  readonly profilePath: string;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly cdpSession?: CDPSession;
  readonly createdAt: Date;
}

const ANTI_DETECTION_SCRIPT = `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`;

/**
 * Discovers, launches, and tears down persistent browser sessions.
 * Enforces a single active session per resolved profile path.
 */
export class SessionManager {
  private readonly lockedProfiles = new Set<string>();

  /**
   * Reports which of the four supported browsers have a resolvable
   * executable on this machine. Unavailable browsers are omitted rather
   * than throwing.
   */
  discoverAvailableBrowsers(): SupportedBrowser[] {
    const candidates: SupportedBrowser[] = [
      'chrome',
      'edge',
      'firefox',
      'safari',
    ];
    const available: SupportedBrowser[] = [];

    for (const browser of candidates) {
      const { engine } = resolveBrowserType(browser);
      const launcher = LAUNCHERS[engine] as unknown as {
        executablePath?: () => string;
      };

      try {
        launcher.executablePath?.();
        available.push(browser);
      } catch {
        // Executable not resolvable on this machine; skip it.
      }
    }

    return available;
  }

  /**
   * Launches (or reuses) a persistent, authenticated browser profile and
   * returns an active session handle. Chromium-based browsers additionally
   * receive a CDP session on the active page.
   *
   * @throws {BrowserLaunchError} when the profile is already locked by an
   * active session, or the underlying launch fails.
   */
  async createSession(config: BrowserConfig): Promise<CdpSessionHandle> {
    const profilePath = resolveProfilePath(config.browser, config.profilePath);

    if (this.lockedProfiles.has(profilePath)) {
      throw new BrowserLaunchError(
        `Profile "${profilePath}" is already in use by an active session.`,
        { profilePath, browser: config.browser },
      );
    }

    const { engine, channel, isChromiumBased } = resolveBrowserType(
      config.browser,
    );

    if (isChromiumBased) {
      await cleanStaleLocks(profilePath);
    }

    const launcher = LAUNCHERS[engine];
    const launchArgs = isChromiumBased
      ? [...DEFAULT_CHROMIUM_LAUNCH_ARGS, ...config.launchArgs]
      : [...config.launchArgs];

    let context: BrowserContext;

    try {
      context = await launcher.launchPersistentContext(profilePath, {
        headless: config.headless,
        args: launchArgs,
        ...(channel ? { channel } : {}),
      });
    } catch (error) {
      throw new BrowserLaunchError(
        `Failed to launch a persistent context for "${config.browser}".`,
        {
          browser: config.browser,
          profilePath,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }

    this.lockedProfiles.add(profilePath);

    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    await page.addInitScript(ANTI_DETECTION_SCRIPT);

    let cdpSession: CDPSession | undefined;

    if (engine === 'chromium') {
      cdpSession = await context.newCDPSession(page);
    }

    return {
      browser: config.browser,
      profilePath,
      context,
      page,
      cdpSession,
      createdAt: new Date(),
    };
  }

  /**
   * Detaches the CDP session while leaving the browser process and profile
   * intact, preserving the authenticated session for future use. The
   * profile lock is released so a subsequent {@link createSession} call may
   * reattach.
   */
  async detachSession(session: CdpSessionHandle): Promise<void> {
    if (session.cdpSession) {
      try {
        await session.cdpSession.detach();
      } catch (error) {
        throw new SessionExpiredError(
          'Failed to detach the CDP session cleanly.',
          {
            profilePath: session.profilePath,
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    this.lockedProfiles.delete(session.profilePath);
  }

  /** Fully closes the browser context and process, releasing the profile lock. */
  async closeSession(session: CdpSessionHandle): Promise<void> {
    await session.context.close();
    this.lockedProfiles.delete(session.profilePath);
  }

  /** Whether `profilePath` currently has an active, locked session. */
  isLocked(profilePath: string): boolean {
    return this.lockedProfiles.has(profilePath);
  }
}

export type { Browser, BrowserContext, CDPSession, Page };
