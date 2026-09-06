import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ProviderHealth } from './common.types.js';

/** A single vector persisted in a {@link VectorStore}. */
export interface VectorEntry {
  readonly id: string;
  readonly vector: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly content?: string;
}

/** Validates the shape of a {@link VectorEntry}. */
export const VectorEntrySchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  vector: z
    .array(z.number())
    .min(1, { error: 'Vector must not be empty' })
    .readonly(),
  metadata: z.record(z.string(), z.unknown()),
  content: z.string().optional(),
});

export type VectorEntryShape = z.infer<typeof VectorEntrySchema>;

/** Options bounding a similarity search against a {@link VectorStore}. */
export interface VectorSearchOptions {
  readonly topK: number;
  readonly threshold?: number;
  readonly filter?: Readonly<Record<string, unknown>>;
}

/** Validates the shape of a {@link VectorSearchOptions}. */
export const VectorSearchOptionsSchema = z.object({
  topK: z.number().int().positive(),
  threshold: z.number().min(0).max(1).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

export type VectorSearchOptionsShape = z.infer<
  typeof VectorSearchOptionsSchema
>;

/** A single similarity-search hit. */
export interface VectorSearchResult {
  readonly id: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly content?: string;
}

/** Validates the shape of a {@link VectorSearchResult}. */
export const VectorSearchResultSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  score: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  content: z.string().optional(),
});

export type VectorSearchResultShape = z.infer<typeof VectorSearchResultSchema>;

/**
 * @experimental Port for vector persistence, similarity search, and
 * lifecycle operations. The contract never references a specific
 * vector-store implementation (sqlite-vec, pgvector, Pinecone, Chroma, and
 * similar).
 */
export interface VectorStore extends Provider {
  /** Inserts or replaces the given entries, keyed by their `id`. */
  upsert(entries: readonly VectorEntry[]): Promise<void>;
  /** Returns the entries most similar to `vector`, bounded by `options`. */
  search(
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<readonly VectorSearchResult[]>;
  /** Removes the entries identified by `ids`. */
  delete(ids: readonly string[]): Promise<void>;
  /** Returns the total number of persisted entries. */
  count(): Promise<number>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
