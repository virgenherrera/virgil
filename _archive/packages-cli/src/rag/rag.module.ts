import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/index.js';
import { FixedWindowChunker } from './adapters/fixed-window-chunker.adapter.js';
import { InMemoryVectorStore } from './adapters/in-memory-vector-store.adapter.js';
import { LexicalSearchService } from './adapters/lexical-search.service.js';
import { StubCodeRetriever } from './adapters/stub-code-retriever.adapter.js';
import { StubEmbeddingAdapter } from './adapters/stub-embedding.adapter.js';
import {
  CHUNKER,
  CODE_RETRIEVER,
  DEFAULT_CACHE_MAX_SIZE,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_EMBEDDING_DIMENSIONS,
  EMBEDDING_PROVIDER,
  VECTOR_STORE,
} from './rag.constants.js';
import { HybridRetrieverService } from './services/hybrid-retriever.service.js';
import { RetrievalCacheService } from './services/retrieval-cache.service.js';
import { TextRetrieverService } from './services/text-retriever.service.js';

/** Configuration for {@link RagModule.forRoot}. */
export interface RagModuleOptions {
  /** SQLite database path — `:memory:` for ephemeral (default). */
  readonly databasePath?: string;
  /** Embedding vector dimensionality (default 384). */
  readonly embeddingDimensions?: number;
  /** Cache time-to-live in milliseconds (default 5 minutes). */
  readonly cacheTtlMs?: number;
  /** Maximum number of cached query results (default 100). */
  readonly cacheMaxSize?: number;
}

/**
 * NestJS module exporting the complete RAG retrieval pipeline (H07).
 *
 * Wires chunking, embedding, vector storage, lexical search,
 * text retrieval, code retrieval, hybrid fusion, and caching through
 * dependency injection. Every component is replaceable via its port.
 */
@Module({})
export class RagModule {
  static forRoot(options: RagModuleOptions = {}): DynamicModule {
    const dims = options.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const maxSize = options.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;

    return {
      module: RagModule,
      imports: [
        PersistenceModule.forRoot({
          databasePath: options.databasePath ?? ':memory:',
        }),
      ],
      providers: [
        {
          provide: CHUNKER,
          useFactory: () => new FixedWindowChunker(),
        },
        {
          provide: EMBEDDING_PROVIDER,
          useFactory: () => new StubEmbeddingAdapter(dims),
        },
        {
          provide: VECTOR_STORE,
          useFactory: () => new InMemoryVectorStore(),
        },
        {
          provide: CODE_RETRIEVER,
          useClass: StubCodeRetriever,
        },
        LexicalSearchService,
        {
          provide: RetrievalCacheService,
          useFactory: () => new RetrievalCacheService(ttl, maxSize),
        },
        TextRetrieverService,
        HybridRetrieverService,
      ],
      exports: [
        CHUNKER,
        EMBEDDING_PROVIDER,
        VECTOR_STORE,
        CODE_RETRIEVER,
        LexicalSearchService,
        TextRetrieverService,
        HybridRetrieverService,
        RetrievalCacheService,
      ],
    };
  }
}
