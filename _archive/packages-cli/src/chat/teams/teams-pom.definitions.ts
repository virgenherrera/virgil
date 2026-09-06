import type { CdpPomShape } from './cdp-browser.port.js';

/**
 * Microsoft Teams search results POM. Navigates to the search results
 * view and extracts matched messages with author, content, and timestamp.
 *
 * NOT production-ready: selectors are illustrative placeholders matching
 * the known Teams Fluent UI data-tid attributes. Re-validate quarterly.
 */
export const teamsSearchPom: CdpPomShape = {
  targetApp: 'teams',
  version: 'teams-search-v1',
  description:
    'Extracts search result messages from the Microsoft Teams web search view.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '[data-tid="search-result-list"]',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'authors',
      selector: '[data-tid="search-result-author"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
    {
      field: 'messages',
      selector: '[data-tid="search-result-body"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
    {
      field: 'timestamps',
      selector: '[data-tid="search-result-timestamp"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
    {
      field: 'channels',
      selector: '[data-tid="search-result-channel"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
    {
      field: 'permalinks',
      selector: '[data-tid="search-result-link"]',
      selectorType: 'css',
      attribute: 'href',
      required: false,
      multiple: true,
    },
  ],
  outputShape: {
    authors: { type: 'array', required: true },
    messages: { type: 'array', required: true },
    timestamps: { type: 'array', required: false },
    channels: { type: 'array', required: false },
    permalinks: { type: 'array', required: false },
  },
  metadata: {
    knownFragility:
      'Teams web client data-tid attributes may change across release trains.',
    maintenanceCadence: 'quarterly',
  },
};

/**
 * Microsoft Teams thread view POM. Extracts all messages from a
 * conversation thread view.
 */
export const teamsThreadPom: CdpPomShape = {
  targetApp: 'teams',
  version: 'teams-thread-v1',
  description:
    'Extracts messages from a Microsoft Teams conversation thread view.',
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
      field: 'messages',
      selector: '[data-tid="message-body-content"]',
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
  ],
  outputShape: {
    authors: { type: 'array', required: true },
    messages: { type: 'array', required: true },
    timestamps: { type: 'array', required: false },
  },
  metadata: {
    knownFragility:
      'Teams web client internal class names churn across every release train.',
    maintenanceCadence: 'quarterly',
  },
};

/**
 * Microsoft Teams channels list POM. Extracts channel names from the
 * Teams sidebar navigation.
 */
export const teamsChannelsPom: CdpPomShape = {
  targetApp: 'teams',
  version: 'teams-channels-v1',
  description:
    'Extracts the list of channels from the Microsoft Teams sidebar.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '[data-tid="channel-list"]',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'channelIds',
      selector: '[data-tid="channel-item"]',
      selectorType: 'css',
      attribute: 'data-channel-id',
      required: true,
      multiple: true,
    },
    {
      field: 'channelNames',
      selector: '[data-tid="channel-name"]',
      selectorType: 'css',
      required: true,
      multiple: true,
    },
    {
      field: 'channelTopics',
      selector: '[data-tid="channel-topic"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
  ],
  outputShape: {
    channelIds: { type: 'array', required: true },
    channelNames: { type: 'array', required: true },
    channelTopics: { type: 'array', required: false },
  },
  metadata: {
    knownFragility: 'Teams sidebar layout changes across client versions.',
    maintenanceCadence: 'quarterly',
  },
};
