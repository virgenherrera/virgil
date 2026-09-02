import type { ZodError } from 'zod';

/**
 * Formats a `ZodError` into human-readable `"path: message"` lines, using
 * `(root)` for issues with an empty path. Shared by every config-reading
 * and input-validating code path in the workspace module so error text
 * stays consistent.
 */
export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}
