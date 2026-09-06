import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ProviderHealth } from './common.types.js';

export interface VectorEntry {
  readonly id: string;
  readonly vector: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly content?: string;
}

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

export interface VectorSearchOptions {
  readonly topK: number;
  readonly threshold?: number;
  readonly filter?: Readonly<Record<string, unknown>>;
}

export const VectorSearchOptionsSchema = z.object({
  topK: z.number().int().positive(),
  threshold: z.number().min(0).max(1).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

export type VectorSearchOptionsShape = z.infer<
  typeof VectorSearchOptionsSchema
>;

export interface VectorSearchResult {
  readonly id: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly content?: string;
}

export const VectorSearchResultSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  score: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  content: z.string().optional(),
});

export type VectorSearchResultShape = z.infer<typeof VectorSearchResultSchema>;

export interface VectorStore extends Provider {
  upsert(entries: readonly VectorEntry[]): Promise<void>;
  search(
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<readonly VectorSearchResult[]>;
  delete(ids: readonly string[]): Promise<void>;
  count(): Promise<number>;
  health(): Promise<ProviderHealth>;
}
