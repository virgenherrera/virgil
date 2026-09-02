import type { PomDefinition } from '../pom-schema.js';

/**
 * Structural scaffold for Monday.com board item extraction.
 *
 * NOT production-ready: selectors are illustrative placeholders.
 * Known fragility: Monday's board view uses virtualized rendering; item
 * detail panes have moderately stable data-testid coverage but timeline
 * and updates widgets are subject to frequent redesign.
 * Maintenance cadence: re-validate quarterly, or after a reported extraction failure.
 */
export const mondayV1Pom: PomDefinition = {
  targetApp: 'monday',
  version: 'monday-v1',
  description:
    'Extracts name, status, assignee, timeline, and updates from a Monday.com board item.',
  navigationSteps: [
    {
      type: 'wait',
      condition: 'selector-visible',
      selector: '[data-testid="item-name-input"]',
      timeoutMs: 30_000,
    },
  ],
  extractionSteps: [
    {
      field: 'name',
      selector: '[data-testid="item-name-input"]',
      selectorType: 'css',
      required: true,
      multiple: false,
    },
    {
      field: 'status',
      selector: '[data-testid="status-label"]',
      selectorType: 'css',
      required: true,
      multiple: false,
    },
    {
      field: 'assignee',
      selector: '[data-testid="person-column-cell"]',
      selectorType: 'css',
      required: false,
      multiple: false,
    },
    {
      field: 'timeline',
      selector: '[data-testid="timeline-column-cell"]',
      selectorType: 'css',
      required: false,
      multiple: false,
    },
    {
      field: 'updates',
      selector: '[data-testid="update-content"]',
      selectorType: 'css',
      required: false,
      multiple: true,
    },
  ],
  outputShape: {
    name: { type: 'string', required: true },
    status: { type: 'string', required: true },
    assignee: { type: 'string', required: false },
    timeline: { type: 'string', required: false },
    updates: { type: 'array', required: false },
  },
  metadata: {
    knownFragility:
      'Monday.com timeline and updates widgets are subject to frequent redesign.',
    maintenanceCadence: 'quarterly',
  },
};
