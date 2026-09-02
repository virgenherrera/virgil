import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import {
  PomRegistry,
  PomExecutor,
  buildNormalizedArtifact,
  buildOutputShapeSchema,
  parsePomVersionMajor,
  registerDefaultPoms,
  DEFAULT_POM_SCAFFOLDS,
  jiraCloudV1Pom,
  type PomDefinition,
} from '../src/index.js';
import { createFakePage } from './support/mock-playwright.js';

const SUMMARY_SELECTOR =
  '[data-testid="issue.views.issue-base.foundation.summary.heading"]';
const STATUS_SELECTOR =
  '[data-testid="issue-field-status.ui.status-view.status-button.button"]';
const DESCRIPTION_SELECTOR =
  '[data-testid="issue.views.field.rich-text.description"]';
const COMMENTS_SELECTOR =
  '[data-testid="issue-activity-comment.ui.comment-item.comment-content"]';

describe('POM flow: registry -> executor -> normalized output (public API)', () => {
  it('loads a registered POM, executes it, and produces a normalized artifact', async () => {
    const registry = new PomRegistry();
    registry.register(jiraCloudV1Pom);

    const resolved = registry.resolve('jira', 'jira-cloud-v1');
    expect(resolved.version).toBe('jira-cloud-v1');

    const page = createFakePage({
      selectors: {
        [SUMMARY_SELECTOR]: ['Fix login bug'],
        [STATUS_SELECTOR]: ['In Progress'],
        [DESCRIPTION_SELECTOR]: ['Steps to reproduce the failure...'],
        [COMMENTS_SELECTOR]: ['LGTM', 'Please rebase on main'],
      },
    }) as unknown as Page;

    const executor = new PomExecutor();
    const result = await executor.execute(resolved, page);

    expect(result.fields).toEqual({
      summary: 'Fix login bug',
      status: 'In Progress',
      description: 'Steps to reproduce the failure...',
      comments: ['LGTM', 'Please rebase on main'],
    });
    expect(result.partial).toBe(true);
    expect([...result.missingFields].sort()).toEqual(['assignee', 'priority']);

    const artifact = buildNormalizedArtifact({
      content: result.fields,
      targetApp: resolved.targetApp,
      url: 'https://virgil.atlassian.net/browse/DEMO-1',
      pomVersion: resolved.version,
      browser: 'chrome',
      profilePath: '/home/dev/.virgil/chrome-data',
      durationMs: 42,
    });

    expect(artifact.provenance).toEqual({
      targetApp: 'jira',
      url: 'https://virgil.atlassian.net/browse/DEMO-1',
      pomVersion: 'jira-cloud-v1',
    });
    expect(artifact.content).toEqual(result.fields);
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves the highest-major "latest" version when none is pinned', () => {
    const registry = new PomRegistry();
    registry.register(jiraCloudV1Pom);

    const resolved = registry.resolve('jira');

    expect(resolved.version).toBe('jira-cloud-v1');
  });

  it('resolves the highest-major version among several registered variants', () => {
    const registry = new PomRegistry();
    const base: Omit<PomDefinition, 'version'> = {
      targetApp: 'demo',
      navigationSteps: [
        { type: 'wait', condition: 'network-idle', timeoutMs: 1_000 },
      ],
      extractionSteps: [
        {
          field: 'x',
          selector: '#x',
          selectorType: 'css',
          required: false,
          multiple: false,
        },
      ],
      outputShape: { x: { type: 'string', required: false } },
    };

    registry.register({ ...base, version: 'demo-app-v1' });
    registry.register({ ...base, version: 'demo-app-v3' });
    registry.register({ ...base, version: 'demo-app-v2' });

    expect(registry.resolve('demo', 'latest').version).toBe('demo-app-v3');
  });

  it('rejects "latest" resolution when no POM is registered for the target', () => {
    const registry = new PomRegistry();
    let thrown: unknown;

    try {
      registry.resolve('nobody-registered-this');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'POM_VERSION_MISMATCH_ERROR' });
  });

  it('registers every bundled structural POM scaffold and resolves each by target', () => {
    const registry = new PomRegistry();
    registerDefaultPoms(registry);

    expect(registry.list()).toHaveLength(DEFAULT_POM_SCAFFOLDS.length);

    for (const pom of DEFAULT_POM_SCAFFOLDS) {
      expect(registry.resolve(pom.targetApp, pom.version)).toEqual(pom);
    }
  });

  it('buildOutputShapeSchema supports every declared field type', () => {
    const schema = buildOutputShapeSchema({
      aString: { type: 'string', required: true },
      aNumber: { type: 'number', required: true },
      aBoolean: { type: 'boolean', required: true },
      anArray: { type: 'array', required: false },
      anObject: { type: 'object', required: false },
    });

    const result = schema.safeParse({
      aString: 'ok',
      aNumber: 1,
      aBoolean: true,
      anArray: [1, 2],
      anObject: { nested: true },
    });

    expect(result.success).toBe(true);
  });

  it('parsePomVersionMajor throws on a malformed version string', () => {
    expect(() => parsePomVersionMajor('not-a-valid-version')).toThrow(
      /Invalid POM version format/,
    );
  });

  it('buildNormalizedArtifact rejects an assembled artifact that fails schema validation', () => {
    expect(() =>
      buildNormalizedArtifact({
        content: { x: 1 },
        targetApp: 'demo',
        url: 'https://example.com',
        pomVersion: 'demo-app-v1',
        browser: 'chrome',
        profilePath: '/home/dev/.virgil/chrome-data',
        durationMs: -1,
      }),
    ).toThrow();
  });
});

describe('PomExecutor: full navigation and extraction step coverage (public API)', () => {
  it('runs click, fill, select, and both wait-condition variants, then extracts attribute and xpath fields', async () => {
    const testPom: PomDefinition = {
      targetApp: 'demo',
      version: 'demo-app-v1',
      navigationSteps: [
        {
          type: 'click',
          selector: '#accept-cookies',
          required: true,
          timeoutMs: 1_000,
        },
        {
          type: 'fill',
          selector: '#search',
          value: 'hello world',
          timeoutMs: 1_000,
        },
        {
          type: 'select',
          selector: '#filter',
          value: 'open',
          timeoutMs: 1_000,
        },
        { type: 'wait', condition: 'network-idle', timeoutMs: 1_000 },
        { type: 'wait', condition: 'timeout', timeoutMs: 5 },
      ],
      extractionSteps: [
        {
          field: 'label',
          selector: '#label',
          selectorType: 'css',
          attribute: 'aria-label',
          required: true,
          multiple: false,
        },
        {
          field: 'items',
          selector: '//li',
          selectorType: 'xpath',
          required: false,
          multiple: true,
        },
      ],
      outputShape: {
        label: { type: 'string', required: true },
        items: { type: 'array', required: false },
      },
    };

    const page = createFakePage({
      selectors: {
        '#label': ['Filtered results'],
        'xpath=//li': ['Item A', 'Item B'],
      },
    }) as unknown as Page;

    const executor = new PomExecutor();
    const result = await executor.execute(testPom, page);

    expect(result.fields).toEqual({
      label: 'Filtered results',
      items: ['Item A', 'Item B'],
    });
    expect(result.partial).toBe(false);
  });
});
