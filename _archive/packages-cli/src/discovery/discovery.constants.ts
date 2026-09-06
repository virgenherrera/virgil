/** DI token for the IssueProvider used by discovery. */
export const DISCOVERY_ISSUE_PROVIDER = Symbol('DISCOVERY_ISSUE_PROVIDER');

/** DI token for the KnowledgeProvider used by discovery. */
export const DISCOVERY_KNOWLEDGE_PROVIDER = Symbol(
  'DISCOVERY_KNOWLEDGE_PROVIDER',
);

/** DI token for the RepoProvider used by discovery. */
export const DISCOVERY_REPO_PROVIDER = Symbol('DISCOVERY_REPO_PROVIDER');

/** DI token for the ChatProvider used by discovery. */
export const DISCOVERY_CHAT_PROVIDER = Symbol('DISCOVERY_CHAT_PROVIDER');

/** Default maximum traversal depth for reference chains. */
export const DEFAULT_MAX_DEPTH = 3;

/** Default maximum total provider queries per discovery cycle. */
export const DEFAULT_MAX_QUERIES = 20;

/** Default maximum evidence artifacts collected per cycle. */
export const DEFAULT_MAX_ARTIFACTS = 50;

/** Default per-provider query budget. */
export const DEFAULT_PER_PROVIDER_BUDGET = 10;

/** Default minimum relevance score for knowledge coverage assessment. */
export const DEFAULT_MIN_RELEVANCE_SCORE = 0.3;

/** Discovery output format version. */
export const DISCOVERY_OUTPUT_VERSION = '1.0.0';
