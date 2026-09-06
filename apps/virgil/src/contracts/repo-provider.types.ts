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

export interface FileEntry {
  readonly path: string;
  readonly mimeType?: string;
  readonly size: number;
  readonly lastModified: Timestamp;
}

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

export const FileEntryPageSchema = createPaginatedResultSchema(FileEntrySchema);

export interface FileContent {
  readonly path: string;
  readonly content: string;
  readonly identity: ContentIdentity;
}

export const FileContentSchema = z.object({
  path: z.string().min(1, { error: 'Path must not be empty' }),
  content: z.string(),
  identity: ContentIdentitySchema,
});

export type FileContentShape = z.infer<typeof FileContentSchema>;

export interface RepoMetadata {
  readonly name: string;
  readonly root: string;
  readonly defaultBranch: string;
  readonly remotes: readonly string[];
  readonly identity: ContentIdentity;
}

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

export interface GitCommitInfo {
  readonly hash: string;
  readonly message: string;
  readonly timestamp: Timestamp;
}

export const GitCommitInfoSchema = z.object({
  hash: z.string().min(1, { error: 'Commit hash must not be empty' }),
  message: z.string(),
  timestamp: TimestampSchema,
});

export interface GitContext {
  readonly currentBranch: string;
  readonly lastCommit: GitCommitInfo;
  readonly isDirty: boolean;
  readonly trackedFileCount: number;
}

export const GitContextSchema = z.object({
  currentBranch: z
    .string()
    .min(1, { error: 'Current branch must not be empty' }),
  lastCommit: GitCommitInfoSchema,
  isDirty: z.boolean(),
  trackedFileCount: z.number().int().nonnegative(),
});

export type GitContextShape = z.infer<typeof GitContextSchema>;

export interface RepoProvider extends Provider {
  listFiles(scope: DiscoveryScope): Promise<PaginatedResult<FileEntry>>;
  readFile(path: string): Promise<FileContent>;
  getMetadata(): Promise<RepoMetadata>;
  getGitContext(): Promise<GitContext>;
  health(): Promise<ProviderHealth>;
}
