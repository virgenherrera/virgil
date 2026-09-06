export const DEFAULT_OBJECTIVE_MAX_LENGTH = 4096;

export const DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH = 2048;

export const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\bbearer\s+[a-z0-9._-]{10,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN(?:\s+[A-Z]+)?\s+PRIVATE KEY-----/,
  /:\/\/[^/\s:@]+:[^/\s@]+@/,
  /\b(?:api[_-]?key|apikey|secret|password|passwd|token)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/i,
];

export function matchesCredentialPattern(value: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));
}
