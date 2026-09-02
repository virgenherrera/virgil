import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CdpBrowserAdapter,
  type BrowserConfig,
  type PomDefinition,
} from '../src/index.js';
import {
  createFakeContext,
  createFakePage,
} from './support/mock-playwright.js';

vi.mock('playwright', async () => {
  const mock = await import('./support/mock-playwright.js');

  return mock.createPlaywrightModule();
});

const testPom: PomDefinition = {
  targetApp: 'demo',
  version: 'demo-app-v1',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '#ready',
      timeoutMs: 5_000,
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
    {
      field: 'tags',
      selector: '.tag',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
  ],
  outputShape: {
    title: { type: 'string', required: true },
    tags: { type: 'array', required: false },
  },
};

const config: BrowserConfig = {
  browser: 'chrome',
  profilePath: '/tmp/virgil-adapter-test-profile',
  headless: true,
  launchArgs: [],
};

describe('CdpBrowserAdapter (public API)', () => {
  let chromium: { launchPersistentContext: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ chromium } = (await import('playwright')) as unknown as {
      chromium: { launchPersistentContext: Mock };
    });
  });

  it('runs the full connect -> navigate -> extract -> dispose flow', async () => {
    const page = createFakePage({
      selectors: {
        '#ready': [],
        '#title': ['Hello Demo'],
        '.tag': ['alpha', 'beta'],
      },
    });
    const context = createFakeContext(page);
    chromium.launchPersistentContext.mockResolvedValueOnce(context);

    const adapter = new CdpBrowserAdapter();

    await adapter.launch(config);
    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      config.profilePath,
      expect.objectContaining({ headless: true, channel: 'chrome' }),
    );

    const artifact = await adapter.executePom(
      testPom,
      'https://demo.example.com/item/1',
    );

    expect(page.goto).toHaveBeenCalledWith(
      'https://demo.example.com/item/1',
      expect.any(Object),
    );
    expect(artifact.content).toEqual({
      title: 'Hello Demo',
      tags: ['alpha', 'beta'],
    });
    expect(artifact.provenance).toEqual({
      targetApp: 'demo',
      url: 'https://demo.example.com/item/1',
      pomVersion: 'demo-app-v1',
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.metadata.browser).toBe('chrome');

    await adapter.detach();
    expect(context.newCDPSession).toHaveBeenCalledWith(page);
    // Detaching releases the CDP session and the profile lock, but the
    // browser process and profile are intentionally left running.
    expect(context.close).not.toHaveBeenCalled();
  });

  it('close() fully closes the browser context and releases the profile lock', async () => {
    const page = createFakePage({ selectors: { '#ready': [] } });
    const context = createFakeContext(page);
    chromium.launchPersistentContext.mockResolvedValueOnce(context);

    const adapter = new CdpBrowserAdapter();
    await adapter.launch(config);

    await adapter.close();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('rejects executePom before launch has been called', async () => {
    const adapter = new CdpBrowserAdapter();

    await expect(
      adapter.executePom(testPom, 'https://demo.example.com'),
    ).rejects.toMatchObject({
      code: 'BROWSER_LAUNCH_ERROR',
    });
  });

  it('detach() and close() are no-ops when no session is active', async () => {
    const adapter = new CdpBrowserAdapter();

    await expect(adapter.detach()).resolves.toBeUndefined();
    await expect(adapter.close()).resolves.toBeUndefined();
  });

  it('rejects a POM whose targetApp does not match the pinned target', async () => {
    const page = createFakePage({
      selectors: { '#ready': [], '#title': ['x'] },
    });
    chromium.launchPersistentContext.mockResolvedValueOnce(
      createFakeContext(page),
    );

    const adapter = new CdpBrowserAdapter({ pinnedTargetApp: 'jira' });
    await adapter.launch(config);

    await expect(
      adapter.executePom(testPom, 'https://demo.example.com'),
    ).rejects.toMatchObject({
      code: 'POM_VERSION_MISMATCH_ERROR',
    });
  });
});
