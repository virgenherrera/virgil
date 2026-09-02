/**
 * `@virgil/pw-cdp` — Playwright CDP browser automation for authenticated
 * enterprise web UIs (Jira, Confluence, Monday, Slack, Teams).
 *
 * This is the package's ONLY public entry point; internal modules under
 * `adapter/`, `pom/`, `session/`, `output/`, and `errors/` are not meant to
 * be imported directly by consumers.
 */

// Adapter contract
export {
  CdpBrowserAdapter,
  type ICdpBrowserAdapter,
  type CdpBrowserAdapterOptions,
} from './adapter/cdp-browser-adapter.js';

// POM schema, registry, and executor
export {
  PomDefinitionSchema,
  PomVersionSchema,
  NavigationStepSchema,
  ExtractionStepSchema,
  OutputFieldSpecSchema,
  buildOutputShapeSchema,
  parsePomVersionMajor,
  type PomDefinition,
  type NavigationStep,
  type ExtractionStep,
  type OutputFieldSpec,
} from './pom/pom-schema.js';
export { PomRegistry } from './pom/pom-registry.js';
export {
  PomExecutor,
  type PomExecutionResult,
  type PomExecutorOptions,
} from './pom/pom-executor.js';
export {
  DEFAULT_POM_SCAFFOLDS,
  registerDefaultPoms,
  jiraCloudV1Pom,
  confluenceCloudV1Pom,
  mondayV1Pom,
  slackWebV1Pom,
  teamsWebV1Pom,
} from './pom/definitions/index.js';

// Session management and browser selection
export {
  BrowserConfigSchema,
  SUPPORTED_BROWSERS,
  type BrowserConfig,
  type SupportedBrowser,
} from './session/browser-config-schema.js';
export {
  resolveBrowserType,
  resolveProfilePath,
  expandHome,
  cleanStaleLocks,
  DEFAULT_CHROMIUM_LAUNCH_ARGS,
  STALE_LOCK_FILES,
  STALE_SESSION_DIR,
  type BrowserEngine,
  type ResolvedBrowserType,
} from './session/browser-resolver.js';
export {
  SessionManager,
  type CdpSessionHandle,
} from './session/session-manager.js';

// Normalized output
export {
  NormalizedArtifactSchema,
  buildNormalizedArtifact,
  type NormalizedArtifact,
  type BuildNormalizedArtifactInput,
} from './output/normalized-artifact.js';

// Error taxonomy
export {
  CdpError,
  BrowserLaunchError,
  SessionExpiredError,
  PomValidationError,
  PomVersionMismatchError,
  SelectorNotFoundError,
  NavigationTimeoutError,
  ExtractionError,
} from './errors/cdp-errors.js';
