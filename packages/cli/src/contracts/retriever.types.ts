import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ContentIdentity, ProviderHealth } from './common.types.js';
import { ContentIdentitySchema } from './common.types.js';

/** The retrieval strategy requested by a caller. */
export enum RetrievalStrategy {
  LEXICAL = 'lexical',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
}

/** Validates a {@link RetrievalStrategy} value. */
export const RetrievalStrategySchema = z.nativeEnum(RetrievalStrategy);

/** Which retrieval path produced a given {@link RetrievalResult}. */
export enum RetrievalResultSource {
  LEXICAL = 'lexical',
  SEMANTIC = 'semantic',
  FUSED = 'fused',
}

/** Options controlling how a {@link Retriever} resolves a query. */
export interface RetrievalOptions {
  readonly topK: number;
  readonly strategy: RetrievalStrategy;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly rerank?: boolean;
}

/** Validates the shape of a {@link RetrievalOptions}. */
export const RetrievalOptionsSchema = z.object({
  topK: z.number().int().positive(),
  strategy: RetrievalStrategySchema,
  filter: z.record(z.string(), z.unknown()).optional(),
  rerank: z.boolean().optional(),
});

export type RetrievalOptionsShape = z.infer<typeof RetrievalOptionsSchema>;

/** A single ranked retrieval hit. */
export interface RetrievalResult {
  readonly id: string;
  readonly content: string;
  readonly score: number;
  readonly source: RetrievalResultSource;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly provenance: ContentIdentity;
}

/** Validates the shape of a {@link RetrievalResult}. */
export const RetrievalResultSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  content: z.string(),
  score: z.number(),
  source: z.nativeEnum(RetrievalResultSource),
  metadata: z.record(z.string(), z.unknown()),
  provenance: ContentIdentitySchema,
});

export type RetrievalResultShape = z.infer<typeof RetrievalResultSchema>;

/**
 * @experimental Port for hybrid retrieval combining lexical and semantic
 * search. Describes the retrieval capability without prescribing the fusion
 * algorithm — that is an adapter/RAG-core concern (H07).
 */
export interface Retriever extends Provider {
  /** Retrieves the top-ranked results for `query`, per `options`. */
  retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<readonly RetrievalResult[]>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
