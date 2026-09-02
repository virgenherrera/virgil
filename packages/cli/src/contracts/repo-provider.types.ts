import { z } from 'zod';
import type { Timestamp } from '../shared/primitives.js';
import { TimestampSchema } from '../shared/primitives.js';
import type { Provider } from '../shared/provider.types.js';
import type {
  ContentIdentity,
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from './common.types.js';
import {
  ContentIdentitySchema,
  createPaginatedResultSchema,
} from './common.types.js';

/** A single file discovered by a {@link RepoProvider}. */
export interface FileEntry {
  readonly path: string;
  readonly mimeType?: string;
  readonly size: number;
  readonly lastModified: Timestamp;
}

/** Validates the shape of a {@link FileEntry}. */
export const FileEntrySchema = z.object({
  path: z.string().min(1, { error: 'Path must not be empty' }),
  mimeType: z
    .string()
    .min(1, { error: 'MIME type must not be empty' })
    .optional(),
  size: z.number().int().nonnegative(),
  lastModified: TimestampSchema,
});

export type FileEntryShape = z.infer<typeof FileEntrySchema>;

/** Validates a paginated page of {@link FileEntry}. */
export const FileEntryPageSchema = createPaginatedResultSchema(FileEntrySchema);

/** The full content of a single file, carrying its content identity for deduplication. */
export interface FileContent {
  readonly path: string;
  readonly content: string;
  readonly identity: ContentIdentity;
}

/** Validates the shape of a {@link FileContent}. */
export const FileContentSchema = z.object({
  path: z.string().min(1, { error: 'Path must not be empty' }),
  content: z.string(),
  identity: ContentIdentitySchema,
});

export type FileContentShape = z.infer<typeof FileContentSchema>;

/** Repository-level identity and location metadata. */
export interface RepoMetadata {
  readonly name: string;
  readonly root: string;
  readonly defaultBranch: string;
  readonly remotes: readonly string[];
  readonly identity: ContentIdentity;
}

/** Validates the shape of a {@link RepoMetadata}. */
export const RepoMetadataSchema = z.object({
  name: z.string().min(1, { error: 'Repository name must not be empty' }),
  root: z.string().min(1, { error: 'Repository root must not be empty' }),
  defaultBranch: z
    .string()
    .min(1, { error: 'Default branch must not be empty' }),
  remotes: z.array(z.string().min(1)).readonly(),
  identity: ContentIdentitySchema,
});

export type RepoMetadataShape = z.infer<typeof RepoMetadataSchema>;

/** Identity of the most recent commit on the current branch. */
export interface GitCommitInfo {
  readonly hash: string;
  readonly message: string;
  readonly timestamp: Timestamp;
}

/** Validates the shape of a {@link GitCommitInfo}. */
export const GitCommitInfoSchema = z.object({
  hash: z.string().min(1, { error: 'Commit hash must not be empty' }),
  message: z.string(),
  timestamp: TimestampSchema,
});

/** Git-aware working-tree state. */
export interface GitContext {
  readonly currentBranch: string;
  readonly lastCommit: GitCommitInfo;
  readonly isDirty: boolean;
  readonly trackedFileCount: number;
}

/** Validates the shape of a {@link GitContext}. */
export const GitContextSchema = z.object({
  currentBranch: z
    .string()
    .min(1, { error: 'Current branch must not be empty' }),
  lastCommit: GitCommitInfoSchema,
  isDirty: z.boolean(),
  trackedFileCount: z.number().int().nonnegative(),
});

export type GitContextShape = z.infer<typeof GitContextSchema>;

/**
 * @experimental Port for repository discovery, file listing, and Git-aware
 * metadata. The contract never assumes a specific Git library or hosting
 * provider.
 */
export interface RepoProvider extends Provider {
  /** Lists files within `scope`, returning a paginated result. */
  listFiles(scope: DiscoveryScope): Promise<PaginatedResult<FileEntry>>;
  /** Reads the full content of a single file, keyed by its repository-relative path. */
  readFile(path: string): Promise<FileContent>;
  /** Returns repository-level identity and location metadata. */
  getMetadata(): Promise<RepoMetadata>;
  /** Returns the current Git-aware working-tree state. */
  getGitContext(): Promise<GitContext>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
