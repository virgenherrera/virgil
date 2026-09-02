import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Page } from 'playwright';
import {
  CdpBrowserAdapter,
  PomExecutor,
  PomRegistry,
  SessionManager,
  type BrowserConfig,
  type PomDefinition,
} from '../src/index.js';
import {
  createFakeCdpSession,
  createFakeContext,
  createFakePage,
  makeTimeoutError,
} from './support/mock-playwright.js';

vi.mock('playwright', async () => {
  const mock = await import('./support/mock-playwright.js');

  return mock.createPlaywrightModule();
});

const config: BrowserConfig = {
  browser: 'chrome',
  profilePath: '/tmp/virgil-error-flows-profile',
  headless: true,
  launchArgs: [],
};

describe('Error flows through the public API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BrowserLaunchError: connection refused when the browser process fails to launch', async () => {
    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:9222'),
    );

    const adapter = new CdpBrowserAdapter();

    await expect(adapter.launch(config)).rejects.toMatchObject({
      code: 'BROWSER_LAUNCH_ERROR',
      metadata: expect.objectContaining({ browser: 'chrome' }),
    });
  });

  it('NavigationTimeoutError: goto does not settle before the configured timeout', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        { type: 'goto', url: 'https://slow.example.com', timeoutMs: 1_000 },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage();
    page.goto.mockRejectedValueOnce(
      makeTimeoutError('Timeout 1000ms exceeded.'),
    );

    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'NAVIGATION_TIMEOUT_ERROR',
      metadata: expect.objectContaining({ url: 'https://slow.example.com' }),
    });
  });

  it('SelectorNotFoundError: a required anchor selector is missing from the page', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'wait',
          condition: 'selector-visible',
          selector: '#ready',
          timeoutMs: 1_000,
        },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage({ selectors: { '#ready': ['ok'] } });
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND_ERROR',
      metadata: expect.objectContaining({ selector: '#title', field: 'title' }),
    });
  });

  it('ExtractionError: a required field extracts to nothing after the smoke test passes', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'wait',
          condition: 'selector-visible',
          selector: '#title',
          timeoutMs: 1_000,
        },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    // Present for the smoke test (waitForSelector) but empty for extraction (count() === 0).
    const page = createFakePage({ selectors: { '#title': [] } });
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'EXTRACTION_ERROR',
      metadata: expect.objectContaining({ field: 'title' }),
    });
  });

  it('PomValidationError: an invalid POM definition is rejected at registration time', () => {
    const registry = new PomRegistry();
    let thrown: unknown;

    try {
      registry.register({ targetApp: 'demo' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'POM_VALIDATION_ERROR' });
  });

  it('PomVersionMismatchError: resolving an unregistered target/version pair fails', () => {
    const registry = new PomRegistry();
    let thrown: unknown;

    try {
      registry.resolve('unknown-app', 'unknown-app-cloud-v1');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'POM_VERSION_MISMATCH_ERROR' });
  });

  it('SessionExpiredError: detach() surfaces a CDP session that fails to detach cleanly', async () => {
    const cdpSession = createFakeCdpSession();
    cdpSession.detach.mockRejectedValueOnce(new Error('Target closed'));

    const context = createFakeContext(createFakePage(), cdpSession);
    const { chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    };
    chromium.launchPersistentContext.mockResolvedValueOnce(context);

    const manager = new SessionManager();
    const session = await manager.createSession(config);

    await expect(manager.detachSession(session)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED_ERROR',
    });
  });

  it('SelectorNotFoundError: a click step selector times out', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'click',
          selector: '#missing-button',
          required: true,
          timeoutMs: 1_000,
        },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage({ missingSelectors: ['#missing-button'] });
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND_ERROR',
      metadata: expect.objectContaining({
        selector: '#missing-button',
        stepType: 'click',
      }),
    });
  });

  it('rethrows an unexpected, non-timeout error raised by a navigation step', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'click',
          selector: '#submit',
          required: true,
          timeoutMs: 1_000,
        },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage();
    page.click.mockRejectedValueOnce(new Error('page crashed'));

    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toThrow('page crashed');
  });

  it('SelectorNotFoundError: a "selector-visible" wait step is missing its selector field', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        { type: 'wait', condition: 'selector-visible', timeoutMs: 1_000 },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage();
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND_ERROR',
    });
  });

  it('SelectorNotFoundError: a "selector-visible" wait step times out waiting for its selector', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'wait',
          condition: 'selector-visible',
          selector: '#never-appears',
          timeoutMs: 1_000,
        },
      ],
      extractionSteps: [
        {
          field: 'title',
          selector: '#title',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      outputShape: { title: { type: 'string', required: true } },
    };

    const page = createFakePage();
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND_ERROR',
      metadata: expect.objectContaining({ selector: '#never-appears' }),
    });
  });

  it('ExtractionError: extraction produces no usable data when every optional field is missing', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        { type: 'wait', condition: 'network-idle', timeoutMs: 1_000 },
      ],
      extractionSteps: [
        {
          field: 'a',
          selector: '#a',
          selectorType: 'css',
          required: false,
          multiple: false,
        },
        {
          field: 'b',
          selector: '#b',
          selectorType: 'css',
          required: false,
          multiple: false,
        },
      ],
      outputShape: {
        a: { type: 'string', required: false },
        b: { type: 'string', required: false },
      },
    };

    const page = createFakePage();
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'EXTRACTION_ERROR',
    });
  });

  it('ExtractionError: extracted values fail the declared output-shape type', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        { type: 'wait', condition: 'network-idle', timeoutMs: 1_000 },
      ],
      extractionSteps: [
        {
          field: 'count',
          selector: '#count',
          selectorType: 'css',
          required: true,
          multiple: false,
        },
      ],
      // Declared as a number, but page text extracts as a string -> Zod rejects it.
      outputShape: { count: { type: 'number', required: true } },
    };

    const page = createFakePage({ selectors: { '#count': ['not-a-number'] } });
    const executor = new PomExecutor();

    await expect(
      executor.execute(testPom, page as unknown as Page),
    ).rejects.toMatchObject({
      code: 'EXTRACTION_ERROR',
    });
  });
});
