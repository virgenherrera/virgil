/** DI token for the {@link import('./ports/chunker.port.js').Chunker} port. */
export const CHUNKER = Symbol('CHUNKER');

/** DI token for the {@link import('../contracts/embedding-provider.types.js').EmbeddingProvider} port. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/** DI token for the {@link import('../contracts/vector-store.types.js').VectorStore} port. */
export const VECTOR_STORE = Symbol('VECTOR_STORE');

/** DI token for the {@link import('./ports/code-retriever.port.js').CodeRetriever} port. */
export const CODE_RETRIEVER = Symbol('CODE_RETRIEVER');

/** Default fixed-window chunk size in approximate tokens. */
export const DEFAULT_CHUNK_TOKEN_SIZE = 512;

/** Default overlap ratio between adjacent chunks (0–1). */
export const DEFAULT_CHUNK_OVERLAP_RATIO = 0.2;

/** Default RRF constant `k` for reciprocal rank fusion. */
export const DEFAULT_RRF_K = 60;

/** Default cache time-to-live in milliseconds (5 minutes). */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Default maximum number of cached query results. */
export const DEFAULT_CACHE_MAX_SIZE = 100;

/** Default embedding dimensionality for the stub adapter. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 384;

/** Default number of top results returned by a retrieval query. */
export const DEFAULT_TOP_K = 10;

/**
 * Approximate character-to-token ratio for English text.
 * Used by the fixed-window chunker when a proper tokenizer is unavailable.
 */
export const APPROXIMATE_CHARS_PER_TOKEN = 4;
