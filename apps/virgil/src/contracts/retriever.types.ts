import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ContentIdentity, ProviderHealth } from './common.types.js';
import { ContentIdentitySchema } from './common.types.js';

export enum RetrievalStrategy {
  LEXICAL = 'lexical',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
}

export const RetrievalStrategySchema = z.nativeEnum(RetrievalStrategy);

export enum RetrievalResultSource {
  LEXICAL = 'lexical',
  SEMANTIC = 'semantic',
  FUSED = 'fused',
}

export interface RetrievalOptions {
  readonly topK: number;
  readonly strategy: RetrievalStrategy;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly rerank?: boolean;
}

export const RetrievalOptionsSchema = z.object({
  topK: z.number().int().positive(),
  strategy: RetrievalStrategySchema,
  filter: z.record(z.string(), z.unknown()).optional(),
  rerank: z.boolean().optional(),
});

export type RetrievalOptionsShape = z.infer<typeof RetrievalOptionsSchema>;

export interface RetrievalResult {
  readonly id: string;
  readonly content: string;
  readonly score: number;
  readonly source: RetrievalResultSource;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly provenance: ContentIdentity;
}

export const RetrievalResultSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  content: z.string(),
  score: z.number(),
  source: z.nativeEnum(RetrievalResultSource),
  metadata: z.record(z.string(), z.unknown()),
  provenance: ContentIdentitySchema,
});

export type RetrievalResultShape = z.infer<typeof RetrievalResultSchema>;

export interface Retriever extends Provider {
  retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<readonly RetrievalResult[]>;
  health(): Promise<ProviderHealth>;
}
