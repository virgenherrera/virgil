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

export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  IN_REVIEW = 'in_review',
  DONE = 'done',
  CLOSED = 'closed',
}

export const IssueStatusSchema = z.nativeEnum(IssueStatus);

export enum IssueReferenceType {
  ISSUE = 'issue',
  PULL_REQUEST = 'pull_request',
  DOCUMENT = 'document',
}

export interface IssueReference {
  readonly type: IssueReferenceType;
  readonly uri: string;
  readonly label?: string;
}

export const IssueReferenceSchema = z.object({
  type: z.nativeEnum(IssueReferenceType),
  uri: z.string().min(1, { error: 'Reference URI must not be empty' }),
  label: z
    .string()
    .min(1, { error: 'Reference label must not be empty' })
    .optional(),
});

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

export const NormalisedIssuePageSchema = createPaginatedResultSchema(
  NormalisedIssueSchema,
);

export interface IssueSearchQuery {
  readonly text?: string;
  readonly status?: IssueStatus;
  readonly labels?: readonly string[];
  readonly cursor?: string;
}

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

export interface IssueProvider extends Provider {
  getIssue(id: string): Promise<NormalisedIssue>;
  search(
    query: IssueSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>>;
  listRelated(
    id: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>>;
  health(): Promise<ProviderHealth>;
}
