import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RetrievalQuery } from '../contracts/retrieval-query.schema.js';
import type { RetrievalResult } from '../contracts/retrieval-result.schema.js';
import {
  DEFAULT_CACHE_MAX_SIZE,
  DEFAULT_CACHE_TTL_MS,
} from '../rag.constants.js';

interface CacheEntry {
  readonly results: RetrievalResult[];
  readonly createdAt: number;
  readonly corpusVersion: string;
}

/** Queryable hit/miss/eviction counters for the retrieval cache. */
export interface CacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
}

/**
 * LRU cache for retrieval query results (D9). Identical queries within
 * a configurable TTL return cached results without re-executing search.
 * Cache keys incorporate query text, filters, and the current corpus
 * version so that any chunk write invalidates stale entries.
 */
@Injectable()
export class RetrievalCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly accessOrder: string[] = [];
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private corpusVersion = '0';
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(
    ttlMs: number = DEFAULT_CACHE_TTL_MS,
    maxSize: number = DEFAULT_CACHE_MAX_SIZE,
  ) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(query: RetrievalQuery): RetrievalResult[] | undefined {
    const key = this.computeKey(query);
    const entry = this.entries.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      this.removeFromAccessOrder(key);
      this.missCount++;
      return undefined;
    }

    // Check corpus version
    if (entry.corpusVersion !== this.corpusVersion) {
      this.entries.delete(key);
      this.removeFromAccessOrder(key);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    this.promoteInAccessOrder(key);
    return entry.results;
  }

  set(query: RetrievalQuery, results: RetrievalResult[]): void {
    const key = this.computeKey(query);

    // Evict LRU entries if at capacity
    while (this.entries.size >= this.maxSize) {
      this.evictLru();
    }

    this.entries.set(key, {
      results,
      createdAt: Date.now(),
      corpusVersion: this.corpusVersion,
    });

    this.promoteInAccessOrder(key);
  }

  /** Invalidates all cached results. Called on any corpus write. */
  invalidate(): void {
    this.corpusVersion = String(Date.now());
    this.entries.clear();
    this.accessOrder.length = 0;
  }

  /** Updates the corpus version to trigger lazy invalidation of stale entries. */
  updateCorpusVersion(version: string): void {
    this.corpusVersion = version;
  }

  /** Returns a snapshot of cache performance counters. */
  metrics(): CacheMetrics {
    return {
      hits: this.hitCount,
      misses: this.missCount,
      evictions: this.evictionCount,
      size: this.entries.size,
    };
  }

  private computeKey(query: RetrievalQuery): string {
    const payload = JSON.stringify({
      text: query.text,
      filters: query.filters,
      limit: query.limit,
      minScore: query.minScore,
      includeCode: query.includeCode,
    });
    return createHash('sha256').update(payload, 'utf-8').digest('hex');
  }

  private evictLru(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.entries.delete(oldest);
      this.evictionCount++;
    }
  }

  private promoteInAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}
