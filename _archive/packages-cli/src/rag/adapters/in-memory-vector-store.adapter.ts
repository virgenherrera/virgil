import { Injectable } from '@nestjs/common';
import { ProviderHealthStatus } from '../../contracts/common.types.js';
import type { ProviderHealth } from '../../contracts/common.types.js';
import type {
  VectorEntry,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
} from '../../contracts/vector-store.types.js';
import { createTimestamp } from '../../shared/primitives.js';
import type { SemVer } from '../../shared/primitives.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../../shared/provider.types.js';
import type { ProviderMetadata } from '../../shared/provider.types.js';

interface StoredVector {
  readonly vector: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly content?: string;
}

/**
 * Pure-JS in-memory vector store with brute-force cosine similarity
 * search (D3). This is the SEA-compatible fallback adapter chosen by
 * the D7 spike — no native SQLite vector extensions are required.
 *
 * Adequate for the corpus sizes expected in a CLI-local knowledge base
 * (up to ~100K vectors). For larger corpora, a native extension adapter
 * can be swapped in through the {@link VectorStore} port.
 */
@Injectable()
export class InMemoryVectorStore implements VectorStore {
  readonly metadata: ProviderMetadata = {
    id: 'in-memory-vector-store',
    name: 'In-Memory Vector Store (pure JS)',
    version: '0.0.1' as SemVer,
    capabilities: [ProviderCapability.VECTOR_STORE],
  };

  status: ProviderStatus = ProviderStatus.CONNECTED;

  private readonly store = new Map<string, StoredVector>();

  async initialize(): Promise<void> {
    this.status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.status;
  }

  async dispose(): Promise<void> {
    this.store.clear();
    this.status = ProviderStatus.DISCONNECTED;
  }

  async upsert(entries: readonly VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      this.store.set(entry.id, {
        vector: entry.vector,
        metadata: entry.metadata,
        content: entry.content,
      });
    }
  }

  async search(
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<readonly VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [id, stored] of this.store) {
      const score = this.cosineSimilarity(vector, stored.vector);

      if (options.threshold !== undefined && score < options.threshold) {
        continue;
      }

      if (
        options.filter &&
        !this.matchesFilter(stored.metadata, options.filter)
      ) {
        continue;
      }

      results.push({
        id,
        score,
        metadata: stored.metadata,
        content: stored.content,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.topK);
  }

  async delete(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      this.store.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      lastChecked: createTimestamp(),
    };
  }

  private cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  private matchesFilter(
    metadata: Readonly<Record<string, unknown>>,
    filter: Readonly<Record<string, unknown>>,
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
