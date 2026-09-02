import type { PomDefinition } from '../pom-schema.js';

/**
 * Structural scaffold for Confluence Cloud wiki page extraction.
 *
 * NOT production-ready: selectors are illustrative placeholders.
 * Known fragility: Confluence's editor rewrite (Fabric) periodically
 * changes content-body markup; title and label chrome are comparatively stable.
 * Maintenance cadence: re-validate quarterly, or after a reported extraction failure.
 */
export const confluenceCloudV1Pom: PomDefinition = {
  targetApp: 'confluence',
  version: 'confluence-cloud-v1',
  description:
    'Extracts title, body content, labels, and last-modified metadata from a Confluence Cloud wiki page.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '#title-text',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'title',
      selector: '#title-text',
      selectorType: 'css',
      required: true,
      multiple: false,
    },
    {
      field: 'body',
      selector: '.ak-renderer-document',
      selectorType: 'css',
      required: true,
      multiple: false,
    },
    {
      field: 'labels',
      selector: '.aui-label, [data-testid="content-tools.labels-list.label"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
    {
      field: 'lastModified',
      selector: '[data-testid="page-detail-recently-updated"]',
      selectorType: 'css',
      required: false,
      multiple: false,
    },
  ],
  outputShape: {
    title: { type: 'string', required: true },
    body: { type: 'string', required: true },
    labels: { type: 'array', required: false },
    lastModified: { type: 'string', required: false },
  },
  metadata: {
    knownFragility:
      'Confluence Fabric editor content-body markup changes with editor releases.',
    maintenanceCadence: 'quarterly',
  },
};
