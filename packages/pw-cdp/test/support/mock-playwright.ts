import { vi } from 'vitest';

/** Builds a fake Playwright `TimeoutError`-shaped error. */
export function makeTimeoutError(message: string): Error {
  const error = new Error(message);
  error.name = 'TimeoutError';

  return error;
}

/**
 * Builds a fake Playwright `Locator`. `values` models what the locator
 * would resolve to on a real page: zero entries means "not found",
 * multiple entries model a multi-match locator.
 */
export function createFakeLocator(values: string[] = []) {
  return {
    count: vi.fn(async () => values.length),
    first: vi.fn(() => createFakeLocator(values.slice(0, 1))),
    nth: vi.fn((index: number) =>
      createFakeLocator(
        values[index] === undefined ? [] : [values[index] as string],
      ),
    ),
    textContent: vi.fn(async () => values[0] ?? null),
    getAttribute: vi.fn(async () => values[0] ?? null),
  };
}

export interface FakePageOptions {
  /** Maps a selector to the text/attribute values it should resolve to. */
  selectors?: Record<string, string[]>;
  /** Selectors that must reject `waitForSelector`/`click` with a TimeoutError. */
  missingSelectors?: string[];
}

export function createFakePage(options: FakePageOptions = {}) {
  const selectors = options.selectors ?? {};
  const missing = new Set(options.missingSelectors ?? []);

  return {
    goto: vi.fn(async () => undefined),
    click: vi.fn(async (selector: string) => {
      if (missing.has(selector)) {
        throw makeTimeoutError(`Timeout waiting for selector "${selector}"`);
      }
    }),
    fill: vi.fn(async (selector: string) => {
      if (missing.has(selector)) {
        throw makeTimeoutError(`Timeout waiting for selector "${selector}"`);
      }
    }),
    selectOption: vi.fn(async (selector: string) => {
      if (missing.has(selector)) {
        throw makeTimeoutError(`Timeout waiting for selector "${selector}"`);
      }
    }),
    waitForSelector: vi.fn(async (selector: string) => {
      if (missing.has(selector) || !(selector in selectors)) {
        throw makeTimeoutError(`Timeout waiting for selector "${selector}"`);
      }
    }),
    waitForLoadState: vi.fn(async () => undefined),
    addInitScript: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) =>
      createFakeLocator(selectors[selector] ?? []),
    ),
  };
}

export function createFakeCdpSession() {
  return {
    detach: vi.fn(async () => undefined),
  };
}

export function createFakeContext(
  page: ReturnType<typeof createFakePage> = createFakePage(),
  cdpSession: ReturnType<typeof createFakeCdpSession> = createFakeCdpSession(),
) {
  return {
    pages: vi.fn(() => [page]),
    newPage: vi.fn(async () => page),
    newCDPSession: vi.fn(async () => cdpSession),
    close: vi.fn(async () => undefined),
  };
}

/** Builds a fresh fake `playwright` module namespace for `vi.mock('playwright', ...)`. */
export function createPlaywrightModule() {
  const chromium = {
    launchPersistentContext: vi.fn(async () => createFakeContext()),
    executablePath: vi.fn(() => '/mock/chromium-executable'),
  };
  const firefox = {
    launchPersistentContext: vi.fn(async () => createFakeContext()),
    executablePath: vi.fn(() => '/mock/firefox-executable'),
  };
  const webkit = {
    launchPersistentContext: vi.fn(async () => createFakeContext()),
    executablePath: vi.fn(() => {
      throw new Error('WebKit executable not found on this machine.');
    }),
  };

  return { chromium, firefox, webkit };
}
