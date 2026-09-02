import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import type { ProviderHealth } from './common.types.js';

/** A single text-to-vector embedding result. */
export interface EmbeddingResult {
  readonly vector: readonly number[];
  readonly tokenCount: number;
  readonly model: string;
}

/** Validates the shape of an {@link EmbeddingResult}. */
export const EmbeddingResultSchema = z.object({
  vector: z
    .array(z.number())
    .min(1, { error: 'Vector must not be empty' })
    .readonly(),
  tokenCount: z.number().int().nonnegative(),
  model: z.string().min(1, { error: 'Model must not be empty' }),
});

export type EmbeddingResultShape = z.infer<typeof EmbeddingResultSchema>;

/** Identity and capacity metadata for the active embedding model. */
export interface EmbeddingModelInfo {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  readonly maxTokens: number;
}

/** Validates the shape of an {@link EmbeddingModelInfo}. */
export const EmbeddingModelInfoSchema = z.object({
  provider: z.string().min(1, { error: 'Provider must not be empty' }),
  model: z.string().min(1, { error: 'Model must not be empty' }),
  dimensions: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
});

export type EmbeddingModelInfoShape = z.infer<typeof EmbeddingModelInfoSchema>;

/**
 * @experimental Port for text-to-vector embedding generation, model-agnostic.
 * The contract never references a specific embedding vendor (OpenAI,
 * Cohere, Ollama, and similar).
 */
export interface EmbeddingProvider extends Provider {
  /** Embeds a batch of texts, preserving input order in the output array. */
  embed(texts: readonly string[]): Promise<readonly EmbeddingResult[]>;
  /** Embeds a single text. */
  embedSingle(text: string): Promise<EmbeddingResult>;
  /** Returns the vector dimensionality produced by the active model. */
  dimensions(): Promise<number>;
  /** Returns identity and capacity metadata for the active model. */
  modelIdentity(): Promise<EmbeddingModelInfo>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
