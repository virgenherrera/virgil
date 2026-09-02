/**
 * Default maximum length (in characters) for the `objective` field, per the
 * H09 Handoff Protocol exclusion rules (D6): prevents inline context dumps
 * masquerading as a single bounded objective statement.
 */
export const DEFAULT_OBJECTIVE_MAX_LENGTH = 4096;

/**
 * Default maximum length (in characters) for a single `acceptanceCriteria`
 * entry's `description`, per the H09 Handoff Protocol exclusion rules (D6).
 */
export const DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH = 2048;

/**
 * Conservative credential-pattern detectors used by the handoff exclusion
 * guard (D6). These target well-known credential *shapes* — Bearer tokens,
 * AWS access keys, PEM private key headers, embedded-credential connection
 * strings, and `key: value` / `key=value` secret assignments — rather than
 * attempting exhaustive secret scanning. Each pattern is deliberately
 * anchored to reduce false positives on ordinary prose (e.g. a sentence that
 * merely mentions the word "token").
 *
 * See H09_HANDOFF_PROTOCOL.md, Deliverable D6 ("Exclusion Validation") and
 * the seed's Handoff Protocol exclusion list.
 */
export const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  // Bearer <token>
  /\bbearer\s+[a-z0-9._-]{10,}\b/i,
  // AWS access key id
  /\bAKIA[0-9A-Z]{16}\b/,
  // PEM-style private key block header
  /-----BEGIN(?:\s+[A-Z]+)?\s+PRIVATE KEY-----/,
  // Connection string / URL with embedded credentials: scheme://user:pass@host
  /:\/\/[^/\s:@]+:[^/\s@]+@/,
  // key: value / key=value secret assignment (api key, secret, password, token)
  /\b(?:api[_-]?key|apikey|secret|password|passwd|token)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/i,
];

/** Returns whether `value` matches any known credential pattern. */
export function matchesCredentialPattern(value: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));
}
