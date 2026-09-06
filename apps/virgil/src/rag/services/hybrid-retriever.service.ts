import { Inject, Injectable } from '@nestjs/common';
import { ProviderHealthStatus } from '../../contracts/common.types.js';
import type { ProviderHealth } from '../../contracts/common.types.js';
import type {
  Retriever,
  RetrievalOptions,
  RetrievalResult as H04RetrievalResult,
} from '../../contracts/retriever.types.js';
import {
  RetrievalResultSource,
  RetrievalStrategy,
} from '../../contracts/retriever.types.js';
import { createContentHash, createTimestamp } from '../../shared/primitives.js';
import type { SemVer } from '../../shared/primitives.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../../shared/provider.types.js';
import type { ProviderMetadata } from '../../shared/provider.types.js';
import type { RetrievalQuery } from '../contracts/retrieval-query.schema.js';
import type { RetrievalResult } from '../contracts/retrieval-result.schema.js';
import { RetrievalQuerySchema } from '../contracts/retrieval-query.schema.js';
import type {
  CodeRetriever,
  CodeRetrievalResult,
} from '../ports/code-retriever.port.js';
import {
  CODE_RETRIEVER,
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
} from '../rag.constants.js';
import type { TextRetrievalHit } from './text-retriever.service.js';
import { TextRetrieverService } from './text-retriever.service.js';
import { RetrievalCacheService } from './retrieval-cache.service.js';

@Injectable()
export class HybridRetrieverService implements Retriever {
  readonly metadata: ProviderMetadata = {
    id: 'hybrid-retriever',
    name: 'Hybrid Retriever (Text + Code)',
    version: '0.0.1' as SemVer,
    capabilities: [ProviderCapability.RETRIEVER],
  };

  status: ProviderStatus = ProviderStatus.CONNECTED;

  private readonly rrfK = DEFAULT_RRF_K;

  constructor(
    private readonly textRetriever: TextRetrieverService,
    @Inject(CODE_RETRIEVER)
    private readonly codeRetriever: CodeRetriever,
    private readonly cache: RetrievalCacheService,
  ) {}

  async initialize(): Promise<void> {
    this.status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.status;
  }

  async dispose(): Promise<void> {
    this.status = ProviderStatus.DISCONNECTED;
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      lastChecked: createTimestamp(),
    };
  }

  async retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<readonly H04RetrievalResult[]> {
    const ragQuery = RetrievalQuerySchema.parse({
      text: query,
      limit: options.topK,
      includeCode: options.strategy === RetrievalStrategy.HYBRID,
    });

    const results = await this.retrieveHybrid(ragQuery);

    return results.map((r) => ({
      id: r.chunkId,
      content: r.content,
      score: r.score,
      source: RetrievalResultSource.FUSED,
      metadata: {
        lexicalScore: r.lexicalScore,
        vectorScore: r.vectorScore,
      },
      provenance: {
        uri: r.provenance.uri,
        hash: r.provenance.contentHash,
        discoveredAt: r.provenance.discoveredAt,
      },
    }));
  }

  async retrieveHybrid(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const cached = this.cache.get(query);
    if (cached) return cached;

    const limit = query.limit ?? DEFAULT_TOP_K;

    const textResults = await this.textRetriever.retrieve(
      query.text,
      limit * 2,
    );

    let codeResults: CodeRetrievalResult[] = [];
    if (query.includeCode) {
      const codeResponse = await this.codeRetriever.retrieveCode({
        text: query.text,
        limit: limit * 2,
      });
      codeResults = [...codeResponse.results];
    }

    const fused = this.fuseTextAndCode(textResults, codeResults, limit);

    const filtered = query.minScore
      ? fused.filter((r) => r.score >= query.minScore!)
      : fused;

    this.cache.set(query, filtered);
    return filtered;
  }

  private fuseTextAndCode(
    textHits: TextRetrievalHit[],
    codeHits: CodeRetrievalResult[],
    limit: number,
  ): RetrievalResult[] {
    const now = createTimestamp();

    if (codeHits.length === 0) {
      return textHits.slice(0, limit).map((hit) => ({
        chunkId: hit.chunkId,
        content: hit.content,
        score: hit.score,
        lexicalScore: hit.lexicalScore,
        vectorScore: hit.vectorScore,
        sourceId: hit.chunkId,
        provenance: {
          provider: 'text-retriever',
          uri: `chunk://${hit.chunkId}`,
          contentHash: createContentHash(hit.content),
          discoveredAt: now,
        },
      }));
    }

    const textRanks = new Map<
      string,
      { rank: number; hit: TextRetrievalHit }
    >();
    textHits.forEach((hit, i) =>
      textRanks.set(hit.chunkId, { rank: i + 1, hit }),
    );

    const codeRanks = new Map<
      string,
      { rank: number; hit: CodeRetrievalResult }
    >();
    codeHits.forEach((hit, i) =>
      codeRanks.set(hit.symbolId, { rank: i + 1, hit }),
    );

    const allIds = new Set([...textRanks.keys(), ...codeRanks.keys()]);
    const scored: RetrievalResult[] = [];

    for (const id of allIds) {
      let rrfScore = 0;
      const textEntry = textRanks.get(id);
      const codeEntry = codeRanks.get(id);

      if (textEntry) {
        rrfScore += 1 / (this.rrfK + textEntry.rank);
      }
      if (codeEntry) {
        rrfScore += 1 / (this.rrfK + codeEntry.rank);
      }

      if (textEntry) {
        scored.push({
          chunkId: textEntry.hit.chunkId,
          content: textEntry.hit.content,
          score: rrfScore,
          lexicalScore: textEntry.hit.lexicalScore,
          vectorScore: textEntry.hit.vectorScore,
          sourceId: textEntry.hit.chunkId,
          provenance: {
            provider: 'text-retriever',
            uri: `chunk://${textEntry.hit.chunkId}`,
            contentHash: createContentHash(textEntry.hit.content),
            discoveredAt: now,
          },
        });
      } else if (codeEntry) {
        scored.push({
          chunkId: codeEntry.hit.symbolId,
          content: codeEntry.hit.content,
          score: rrfScore,
          lexicalScore: null,
          vectorScore: null,
          sourceId: codeEntry.hit.filePath,
          provenance: {
            provider: codeEntry.hit.provenance.provider,
            uri: codeEntry.hit.provenance.uri,
            contentHash: createContentHash(codeEntry.hit.content),
            discoveredAt: codeEntry.hit.provenance.discoveredAt,
          },
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
