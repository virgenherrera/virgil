import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ProviderHealthStatus } from '../../contracts/common.types.js';
import type { ProviderHealth } from '../../contracts/common.types.js';
import type {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingResult,
} from '../../contracts/embedding-provider.types.js';
import { createTimestamp } from '../../shared/primitives.js';
import type { SemVer } from '../../shared/primitives.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../../shared/provider.types.js';
import type { ProviderMetadata } from '../../shared/provider.types.js';
import { DEFAULT_EMBEDDING_DIMENSIONS } from '../rag.constants.js';

/**
 * Deterministic stub embedding provider for testing (D2). Generates
 * hash-derived unit vectors from text content so tests can verify
 * embedding pipeline behavior without network calls or a real model.
 */
@Injectable()
export class StubEmbeddingAdapter implements EmbeddingProvider {
  readonly metadata: ProviderMetadata = {
    id: 'stub-embedding',
    name: 'Stub Embedding Provider',
    version: '0.0.1' as SemVer,
    capabilities: [ProviderCapability.EMBEDDING],
  };

  status: ProviderStatus = ProviderStatus.CONNECTED;

  private readonly dims: number;

  constructor(dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS) {
    this.dims = dimensions;
  }

  async initialize(): Promise<void> {
    this.status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.status;
  }

  async dispose(): Promise<void> {
    this.status = ProviderStatus.DISCONNECTED;
  }

  async embed(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
    return texts.map((text) => this.generateResult(text));
  }

  async embedSingle(text: string): Promise<EmbeddingResult> {
    return this.generateResult(text);
  }

  async dimensions(): Promise<number> {
    return this.dims;
  }

  async modelIdentity(): Promise<EmbeddingModelInfo> {
    return {
      provider: 'stub',
      model: `stub-${this.dims}`,
      dimensions: this.dims,
      maxTokens: 8192,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      lastChecked: createTimestamp(),
    };
  }

  private generateResult(text: string): EmbeddingResult {
    const vector = this.deterministicVector(text);
    return {
      vector,
      tokenCount: Math.ceil(text.length / 4),
      model: `stub-${this.dims}`,
    };
  }

  /**
   * Generates a deterministic, normalized unit vector from the text's
   * SHA-256 hash. Each 8 hex characters of the hash produce one float
   * component. When more components are needed than the hash provides,
   * the hash is re-hashed to extend the sequence.
   */
  private deterministicVector(text: string): readonly number[] {
    const raw: number[] = [];
    let hashHex = createHash('sha256').update(text, 'utf-8').digest('hex');

    while (raw.length < this.dims) {
      for (let i = 0; i < hashHex.length && raw.length < this.dims; i += 8) {
        const chunk = hashHex.slice(i, i + 8);
        const value = parseInt(chunk, 16) / 0xffffffff - 0.5;
        raw.push(value);
      }
      hashHex = createHash('sha256').update(hashHex, 'utf-8').digest('hex');
    }

    // Normalize to unit length for meaningful cosine similarity
    const magnitude = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
    return magnitude > 0
      ? Object.freeze(raw.map((v) => v / magnitude))
      : Object.freeze(raw);
  }
}
