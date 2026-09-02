import type { PomDefinition } from '../pom-schema.js';
import { confluenceCloudV1Pom } from './confluence.pom.js';
import { jiraCloudV1Pom } from './jira.pom.js';
import { mondayV1Pom } from './monday.pom.js';
import { slackWebV1Pom } from './slack.pom.js';
import { teamsWebV1Pom } from './teams.pom.js';
import type { PomRegistry } from '../pom-registry.js';

export { confluenceCloudV1Pom } from './confluence.pom.js';
export { jiraCloudV1Pom } from './jira.pom.js';
export { mondayV1Pom } from './monday.pom.js';
export { slackWebV1Pom } from './slack.pom.js';
export { teamsWebV1Pom } from './teams.pom.js';

/** Every bundled structural POM scaffold, in target-alphabetical order. */
export const DEFAULT_POM_SCAFFOLDS: readonly PomDefinition[] = [
  confluenceCloudV1Pom,
  jiraCloudV1Pom,
  mondayV1Pom,
  slackWebV1Pom,
  teamsWebV1Pom,
];

/** Registers every bundled structural POM scaffold on `registry`. */
export function registerDefaultPoms(registry: PomRegistry): void {
  for (const pom of DEFAULT_POM_SCAFFOLDS) {
    registry.register(pom);
  }
}
