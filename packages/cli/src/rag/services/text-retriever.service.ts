import { Inject, Injectable } from '@nestjs/common';
import type { EmbeddingProvider } from '../../contracts/embedding-provider.types.js';
import type {
  VectorSearchResult,
  VectorStore,
} from '../../contracts/vector-store.types.js';
import type { LexicalMatch } from '../adapters/lexical-search.service.js';
import { LexicalSearchService } from '../adapters/lexical-search.service.js';
import {
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  EMBEDDING_PROVIDER,
  VECTOR_STORE,
} from '../rag.constants.js';

/** A single text retrieval hit with component scores from both paths. */
export interface TextRetrievalHit {
  readonly chunkId: string;
  readonly content: string;
  readonly score: number;
  readonly lexicalScore: number | null;
  readonly vectorScore: number | null;
}

/**
 * Text retriever service combining lexical (FTS5 BM25) and semantic
 * (vector cosine similarity) search paths via Reciprocal Rank Fusion.
 * This is the traditional RAG pipeline for document/prose content.
 */
@Injectable()
export class TextRetrieverService {
  private readonly rrfK = DEFAULT_RRF_K;

  constructor(
    private readonly lexicalSearch: LexicalSearchService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE)
    private readonly vectorStore: VectorStore,
  ) {}

  /**
   * Retrieves chunks matching `query` using hybrid lexical + semantic
   * search, fused via RRF (k=60).
   */
  async retrieve(
    query: string,
    limit: number = DEFAULT_TOP_K,
  ): Promise<TextRetrievalHit[]> {
    // Dispatch both search paths concurrently
    const [lexicalResults, semanticResults] = await Promise.all([
      this.searchLexical(query, limit * 2),
      this.searchSemantic(query, limit * 2),
    ]);

    return this.fuseResults(lexicalResults, semanticResults, limit);
  }

  private searchLexical(query: string, limit: number): Promise<LexicalMatch[]> {
    return Promise.resolve(this.lexicalSearch.search(query, limit));
  }

  private async searchSemantic(
    query: string,
    limit: number,
  ): Promise<readonly VectorSearchResult[]> {
    const embedding = await this.embeddingProvider.embedSingle(query);
    return this.vectorStore.search(embedding.vector, { topK: limit });
  }

  /**
   * Merges lexical and semantic ranked lists using Reciprocal Rank Fusion.
   * `score(d) = sum(1 / (k + rank_i(d)))` where k = 60.
   * Results are deduplicated by chunk ID before fusion.
   */
  private fuseResults(
    lexical: LexicalMatch[],
    semantic: readonly VectorSearchResult[],
    limit: number,
  ): TextRetrievalHit[] {
    // Build rank and content maps for each path
    const lexicalRanks = new Map<string, number>();
    const lexicalContent = new Map<string, string>();
    const lexicalScores = new Map<string, number>();

    for (let i = 0; i < lexical.length; i++) {
      const match = lexical[i];
      lexicalRanks.set(match.chunkId, i + 1);
      lexicalContent.set(match.chunkId, match.content);
      lexicalScores.set(match.chunkId, match.score);
    }

    const semanticRanks = new Map<string, number>();
    const semanticContent = new Map<string, string>();
    const semanticScores = new Map<string, number>();

    for (let i = 0; i < semantic.length; i++) {
      const match = semantic[i];
      semanticRanks.set(match.id, i + 1);
      semanticContent.set(match.id, match.content ?? '');
      semanticScores.set(match.id, match.score);
    }

    // Union of all chunk IDs (deduplication)
    const allChunkIds = new Set([
      ...lexicalRanks.keys(),
      ...semanticRanks.keys(),
    ]);

    // Compute RRF scores
    const scored: TextRetrievalHit[] = [];

    for (const chunkId of allChunkIds) {
      let rrfScore = 0;

      const lexRank = lexicalRanks.get(chunkId);
      if (lexRank !== undefined) {
        rrfScore += 1 / (this.rrfK + lexRank);
      }

      const semRank = semanticRanks.get(chunkId);
      if (semRank !== undefined) {
        rrfScore += 1 / (this.rrfK + semRank);
      }

      const content =
        lexicalContent.get(chunkId) ?? semanticContent.get(chunkId) ?? '';

      scored.push({
        chunkId,
        content,
        score: rrfScore,
        lexicalScore: lexicalScores.get(chunkId) ?? null,
        vectorScore: semanticScores.get(chunkId) ?? null,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
