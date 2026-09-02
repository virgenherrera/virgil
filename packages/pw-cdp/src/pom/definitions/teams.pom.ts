import type { PomDefinition } from '../pom-schema.js';

/**
 * Structural scaffold for Microsoft Teams web chat message extraction.
 *
 * NOT production-ready: selectors are illustrative placeholders.
 * Known fragility: Teams web client is built on a frequently refreshed
 * Fluent UI + React stack; role/aria hooks are comparatively stable but
 * internal class names churn across every release train.
 * Maintenance cadence: re-validate quarterly, or after a reported extraction failure.
 */
export const teamsWebV1Pom: PomDefinition = {
  targetApp: 'teams',
  version: 'teams-web-v1',
  description:
    'Extracts recent messages (author, timestamp, content) from a Microsoft Teams web chat view.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '[data-tid="message-pane-list-viewport"]',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'authors',
      selector: '[data-tid="message-author-name"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
    {
      field: 'timestamps',
      selector: '[data-tid="message-timestamp"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
    {
      field: 'messages',
      selector: '[data-tid="message-body-content"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
  ],
  outputShape: {
    authors: { type: 'array', required: true },
    timestamps: { type: 'array', required: false },
    messages: { type: 'array', required: true },
  },
  metadata: {
    knownFragility:
      'Teams web client internal class names churn across every release train.',
    maintenanceCadence: 'quarterly',
  },
};
