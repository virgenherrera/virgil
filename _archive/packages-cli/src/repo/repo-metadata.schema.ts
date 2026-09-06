import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';

/**
 * A single commit entry from the bounded recent-commit log.
 * Richer than the contract's `GitCommitInfo` — carries author details
 * needed for contributor summaries and provenance tracking.
 */
export const CommitEntrySchema = z.object({
  sha: z.string().min(1, { error: 'Commit SHA must not be empty' }),
  authorName: z.string().min(1, { error: 'Author name must not be empty' }),
  authorEmail: z.string().min(1, { error: 'Author email must not be empty' }),
  date: z.string().min(1, { error: 'Date must not be empty' }),
  subject: z.string(),
});

export type CommitEntry = z.infer<typeof CommitEntrySchema>;

/**
 * A deduplicated contributor entry derived from the recent commit range.
 */
export const ContributorSchema = z.object({
  name: z.string().min(1, { error: 'Contributor name must not be empty' }),
  email: z.string().min(1, { error: 'Contributor email must not be empty' }),
  commitCount: z.number().int().positive(),
});

export type Contributor = z.infer<typeof ContributorSchema>;

/**
 * Detailed working-tree status with counts per category, extending the
 * contract's boolean `isDirty` with structured breakdown.
 */
export const DetailedStatusSchema = z.object({
  clean: z.boolean(),
  modified: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
});

export type DetailedStatus = z.infer<typeof DetailedStatusSchema>;

/**
 * A Git remote entry (name and URL pair).
 */
export const RemoteEntrySchema = z.object({
  name: z.string().min(1, { error: 'Remote name must not be empty' }),
  url: z.string().min(1, { error: 'Remote URL must not be empty' }),
});

export type RemoteEntry = z.infer<typeof RemoteEntrySchema>;

/**
 * Structured result returned by CodeGraph structural query methods.
 */
export const CodeGraphResultSchema = z.object({
  available: z.boolean(),
  output: z.string(),
  exitCode: z.number().int(),
  timestamp: TimestampSchema,
});

export type CodeGraphResult = z.infer<typeof CodeGraphResultSchema>;
