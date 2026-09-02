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

/**
 * A knowledge/document artifact as fetched directly from a provider,
 * carrying raw content.
 *
 * This is distinct from `KnowledgeArtifact` in `src/shared/knowledge.types.ts`,
 * which models the *persisted* record after ingestion (content-addressed,
 * no raw content body). `KnowledgeDocument` is the provider-facing wire
 * shape; the persistence layer (H06) is responsible for turning one into
 * the other.
 */
export interface KnowledgeDocument {
  readonly identity: ContentIdentity;
  readonly title: string;
  readonly mimeType: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Validates the shape of a {@link KnowledgeDocument}. */
export const KnowledgeDocumentSchema = z.object({
  identity: ContentIdentitySchema,
  title: z.string().min(1, { error: 'Title must not be empty' }),
  mimeType: z.string().min(1, { error: 'MIME type must not be empty' }),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export type KnowledgeDocumentShape = z.infer<typeof KnowledgeDocumentSchema>;

/** Validates a paginated page of {@link KnowledgeDocument}. */
export const KnowledgeDocumentPageSchema = createPaginatedResultSchema(
  KnowledgeDocumentSchema,
);

/**
 * @experimental Port for knowledge/document source access (local filesystem,
 * synchronized folders, Confluence, wikis, and similar sources). Concrete
 * adapters implement this against the API, PW CDP browser-automation, or
 * local filesystem adapter families — see
 * `packages/cli/docs/port-adapter-architecture.md`.
 *
 * The contract never references a specific knowledge source; adapters own
 * that coupling.
 */
export interface KnowledgeProvider extends Provider {
  /** Discovers artifacts within `scope`, returning a paginated result. */
  discover(scope: DiscoveryScope): Promise<PaginatedResult<KnowledgeDocument>>;
  /** Fetches a single artifact by its content identity. */
  fetch(identity: ContentIdentity): Promise<KnowledgeDocument>;
  /** Lists previously discovered artifacts, resuming from an optional cursor. */
  list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
