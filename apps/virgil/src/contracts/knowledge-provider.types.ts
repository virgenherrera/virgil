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

export interface KnowledgeDocument {
  readonly identity: ContentIdentity;
  readonly title: string;
  readonly mimeType: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export const KnowledgeDocumentSchema = z.object({
  identity: ContentIdentitySchema,
  title: z.string().min(1, { error: 'Title must not be empty' }),
  mimeType: z.string().min(1, { error: 'MIME type must not be empty' }),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export type KnowledgeDocumentShape = z.infer<typeof KnowledgeDocumentSchema>;

export const KnowledgeDocumentPageSchema = createPaginatedResultSchema(
  KnowledgeDocumentSchema,
);

export interface KnowledgeProvider extends Provider {
  discover(scope: DiscoveryScope): Promise<PaginatedResult<KnowledgeDocument>>;
  fetch(identity: ContentIdentity): Promise<KnowledgeDocument>;
  list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>>;
  health(): Promise<ProviderHealth>;
}
