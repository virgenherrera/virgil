import { CDP_BROWSER_PORT } from '../../src/chat/teams/cdp-browser.port.js';
import type {
  CdpBrowserPort,
  CdpBrowserConfig,
  CdpPomShape,
  CdpExecutionResult,
} from '../../src/chat/teams/cdp-browser.port.js';

describe('CDP_BROWSER_PORT', () => {
  it('is a unique symbol token', () => {
    expect(typeof CDP_BROWSER_PORT).toBe('symbol');
    expect(CDP_BROWSER_PORT.toString()).toContain('CDP_BROWSER_PORT');
  });
});

describe('CdpBrowserPort interface', () => {
  it('accepts a conforming mock implementation', async () => {
    const mock: CdpBrowserPort = {
      launch: vi.fn().mockResolvedValue(undefined),
      executePom: vi.fn().mockResolvedValue({
        content: {},
        provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
        contentHash: 'a'.repeat(64),
        extractedAt: new Date().toISOString(),
        metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
      } satisfies CdpExecutionResult),
      detach: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const config: CdpBrowserConfig = { browser: 'chromium', headless: true };
    await mock.launch(config);
    expect(mock.launch).toHaveBeenCalledWith(config);

    const pom: CdpPomShape = {
      targetApp: 'teams',
      version: 'test-v1',
      navigationSteps: [],
      extractionSteps: [],
      outputShape: {},
    };
    const result = await mock.executePom(pom, 'https://teams.microsoft.com');
    expect(result.content).toBeDefined();

    await mock.detach();
    await mock.close();
    expect(mock.close).toHaveBeenCalled();
  });
});
