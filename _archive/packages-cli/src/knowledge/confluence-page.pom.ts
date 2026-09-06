/**
 * Page Object Model definitions for Confluence page structures.
 *
 * Used by the Confluence CDP adapter to navigate and extract content
 * from rendered Confluence pages via browser automation.
 */

/** Minimal POM definition shape consumed by the CDP adapter. */
export interface CdpPomShape {
  readonly targetApp: string;
  readonly version: string;
  readonly description?: string;
  readonly navigationSteps: readonly Record<string, unknown>[];
  readonly extractionSteps: readonly Record<string, unknown>[];
  readonly outputShape: Record<string, { type: string; required: boolean }>;
  readonly metadata?: Record<string, unknown>;
}

/** Extraction result from a CDP POM execution. */
export interface CdpExecutionResult {
  readonly content: Record<string, unknown>;
  readonly provenance: {
    readonly targetApp: string;
    readonly url: string;
    readonly pomVersion: string;
  };
  readonly contentHash: string;
  readonly extractedAt: string;
  readonly metadata: {
    readonly browser: string;
    readonly profilePath: string;
    readonly durationMs: number;
  };
}

/** CDP browser port contract for knowledge adapters. */
export interface CdpBrowserPort {
  launch(config: {
    browser: string;
    headless: boolean;
    profilePath?: string;
  }): Promise<void>;
  executePom(pom: CdpPomShape, targetUrl: string): Promise<CdpExecutionResult>;
  detach(): Promise<void>;
  close(): Promise<void>;
}

/** POM definition for extracting a Confluence page's content. */
export const confluencePagePom: CdpPomShape = {
  targetApp: 'confluence',
  version: '1.0.0',
  description:
    'Extracts title, content, and child links from a Confluence page',
  navigationSteps: [
    {
      action: 'waitForSelector',
      selector: '#title-text, [data-testid="title-text"]',
      timeout: 10000,
    },
  ],
  extractionSteps: [
    {
      action: 'getText',
      selector: '#title-text, [data-testid="title-text"]',
      outputKey: 'title',
    },
    {
      action: 'getHTML',
      selector: '#main-content, [data-testid="page-content-body"]',
      outputKey: 'content',
    },
    {
      action: 'getLinks',
      selector: '.childpages-macro a, [data-testid="children-item"] a',
      outputKey: 'childLinks',
    },
  ],
  outputShape: {
    title: { type: 'string', required: true },
    content: { type: 'string', required: true },
    childLinks: { type: 'array', required: false },
  },
};

/** POM definition for extracting child page links from a Confluence page. */
export const confluenceChildPagesPom: CdpPomShape = {
  targetApp: 'confluence',
  version: '1.0.0',
  description: 'Extracts child page links from a Confluence parent page',
  navigationSteps: [
    {
      action: 'waitForSelector',
      selector: '.childpages-macro, [data-testid="children-item"]',
      timeout: 10000,
    },
  ],
  extractionSteps: [
    {
      action: 'getLinks',
      selector: '.childpages-macro a, [data-testid="children-item"] a',
      outputKey: 'childLinks',
    },
  ],
  outputShape: {
    childLinks: { type: 'array', required: true },
  },
};
