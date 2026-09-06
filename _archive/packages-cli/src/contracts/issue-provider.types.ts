import { z } from 'zod';
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

/** Vendor-neutral normalization of a work-item's lifecycle state. */
export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  IN_REVIEW = 'in_review',
  DONE = 'done',
  CLOSED = 'closed',
}

/** Validates an {@link IssueStatus} value. */
export const IssueStatusSchema = z.nativeEnum(IssueStatus);

/** The kind of entity a {@link IssueReference} points to. */
export enum IssueReferenceType {
  ISSUE = 'issue',
  PULL_REQUEST = 'pull_request',
  DOCUMENT = 'document',
}

/** A link from a {@link NormalisedIssue} to another issue, PR, or document. */
export interface IssueReference {
  readonly type: IssueReferenceType;
  readonly uri: string;
  readonly label?: string;
}

/** Validates the shape of an {@link IssueReference}. */
export const IssueReferenceSchema = z.object({
  type: z.nativeEnum(IssueReferenceType),
  uri: z.string().min(1, { error: 'Reference URI must not be empty' }),
  label: z
    .string()
    .min(1, { error: 'Reference label must not be empty' })
    .optional(),
});

/**
 * A work-item normalized away from any specific issue tracker's field
 * naming, workflow states, or schema quirks.
 */
export interface NormalisedIssue {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string;
  readonly status: IssueStatus;
  readonly assignee?: string;
  readonly labels: readonly string[];
  readonly references: readonly IssueReference[];
  readonly identity: ContentIdentity;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Validates the shape of a {@link NormalisedIssue}. */
export const NormalisedIssueSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  externalId: z.string().min(1, { error: 'External id must not be empty' }),
  title: z.string().min(1, { error: 'Title must not be empty' }),
  description: z.string(),
  status: IssueStatusSchema,
  assignee: z
    .string()
    .min(1, { error: 'Assignee must not be empty' })
    .optional(),
  labels: z.array(z.string().min(1)).readonly(),
  references: z.array(IssueReferenceSchema).readonly(),
  identity: ContentIdentitySchema,
  metadata: z.record(z.string(), z.unknown()),
});

export type NormalisedIssueShape = z.infer<typeof NormalisedIssueSchema>;

/** Validates a paginated page of {@link NormalisedIssue}. */
export const NormalisedIssuePageSchema = createPaginatedResultSchema(
  NormalisedIssueSchema,
);

/** A vendor-neutral search query against an issue tracker. */
export interface IssueSearchQuery {
  readonly text?: string;
  readonly status?: IssueStatus;
  readonly labels?: readonly string[];
  readonly cursor?: string;
}

/** Validates the shape of an {@link IssueSearchQuery}. */
export const IssueSearchQuerySchema = z.object({
  text: z
    .string()
    .min(1, { error: 'Search text must not be empty' })
    .optional(),
  status: IssueStatusSchema.optional(),
  labels: z.array(z.string().min(1)).optional(),
  cursor: z.string().min(1, { error: 'Cursor must not be empty' }).optional(),
});

export type IssueSearchQueryShape = z.infer<typeof IssueSearchQuerySchema>;

/**
 * @experimental Port for work-item retrieval and normalization (GitHub
 * Issues, Jira, Monday, and similar trackers). The contract never
 * references a specific tracker's vendor field names.
 */
export interface IssueProvider extends Provider {
  /** Retrieves and normalizes a single issue by its provider-scoped identifier. */
  getIssue(id: string): Promise<NormalisedIssue>;
  /** Searches for issues matching `query`, bounded by an optional discovery scope. */
  search(
    query: IssueSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>>;
  /** Lists issues related to `id` (linked, blocking, duplicates, and similar relations). */
  listRelated(
    id: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
