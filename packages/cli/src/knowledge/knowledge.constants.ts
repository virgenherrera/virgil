/**
 * Dependency-injection tokens for the knowledge module.
 *
 * Adapters depend on these tokens instead of concrete implementations,
 * preserving testability and allowing test modules to supply mocks.
 */

/** Injection token for the HTTP client used by the Confluence API adapter. */
export const HTTP_CLIENT = Symbol('KNOWLEDGE_HTTP_CLIENT');

/** Injection token for the CDP browser port used by the Confluence CDP adapter. */
export const CDP_SESSION = Symbol('KNOWLEDGE_CDP_SESSION');
