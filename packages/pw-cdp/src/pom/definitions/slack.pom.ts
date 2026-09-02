import type { PomDefinition } from '../pom-schema.js';

/**
 * Structural scaffold for Slack web channel message extraction.
 *
 * NOT production-ready: selectors are illustrative placeholders.
 * Known fragility: Slack's message list is virtualized and uses
 * obfuscated class names alongside data-qa attributes; data-qa hooks are
 * comparatively stable but message grouping markup changes across releases.
 * Maintenance cadence: re-validate quarterly, or after a reported extraction failure.
 */
export const slackWebV1Pom: PomDefinition = {
  targetApp: 'slack',
  version: 'slack-web-v1',
  description:
    'Extracts recent messages (author, timestamp, content) from a Slack web channel view.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '[data-qa="virtual_list"]',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'authors',
      selector: '[data-qa="message_sender_name"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
    {
      field: 'timestamps',
      selector: '[data-qa="timestamp"]',
      selectorType: 'css',
      attribute: 'aria-label',
      required: false,
      multiple: true,
    },
    {
      field: 'messages',
      selector: '[data-qa="message-text"]',
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
      'Slack message-grouping markup changes across web client releases.',
    maintenanceCadence: 'quarterly',
  },
};
