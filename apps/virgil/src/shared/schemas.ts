import { z } from 'zod';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Validates a workspace slug: lowercase alphanumeric plus hyphens,
 * 1-64 characters, must start with a lowercase letter. Enforced as
 * lowercase-only to avoid slug collisions on case-insensitive
 * filesystems (e.g. macOS HFS+).
 */
export const WorkspaceSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SLUG_PATTERN, {
    error:
      'Slug must start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and be 1-64 characters',
  });

export type WorkspaceSlug = z.infer<typeof WorkspaceSlugSchema>;

export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const JsonOptionSchema = z.object({
  json: z.coerce.boolean().default(false),
});

export type JsonOption = z.infer<typeof JsonOptionSchema>;
