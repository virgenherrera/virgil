import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ProviderHealth } from './common.types.js';

export interface EmbeddingResult {
  readonly vector: readonly number[];
  readonly tokenCount: number;
  readonly model: string;
}

export const EmbeddingResultSchema = z.object({
  vector: z
    .array(z.number())
    .min(1, { error: 'Vector must not be empty' })
    .readonly(),
  tokenCount: z.number().int().nonnegative(),
  model: z.string().min(1, { error: 'Model must not be empty' }),
});

export type EmbeddingResultShape = z.infer<typeof EmbeddingResultSchema>;

export interface EmbeddingModelInfo {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  readonly maxTokens: number;
}

export const EmbeddingModelInfoSchema = z.object({
  provider: z.string().min(1, { error: 'Provider must not be empty' }),
  model: z.string().min(1, { error: 'Model must not be empty' }),
  dimensions: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
});

export type EmbeddingModelInfoShape = z.infer<typeof EmbeddingModelInfoSchema>;

export interface EmbeddingProvider extends Provider {
  embed(texts: readonly string[]): Promise<readonly EmbeddingResult[]>;
  embedSingle(text: string): Promise<EmbeddingResult>;
  dimensions(): Promise<number>;
  modelIdentity(): Promise<EmbeddingModelInfo>;
  health(): Promise<ProviderHealth>;
}
