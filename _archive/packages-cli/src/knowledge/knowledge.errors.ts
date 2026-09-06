import type { ProviderMetadata } from '../shared/provider.types.js';

/** Machine-readable error codes surfaced by knowledge adapters. */
export enum KnowledgeErrorCode {
  NOT_INITIALISED = 'NOT_INITIALISED',
  HTTP_ERROR = 'HTTP_ERROR',
  AUTH_FAILED = 'AUTH_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMITED = 'RATE_LIMITED',
  PARSE_ERROR = 'PARSE_ERROR',
  CDP_ERROR = 'CDP_ERROR',
  FILESYSTEM_ERROR = 'FILESYSTEM_ERROR',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  BOUNDARY_VIOLATION = 'BOUNDARY_VIOLATION',
}

/**
 * Structured error surfaced by knowledge provider adapters.
 * Carries the originating provider's metadata and a machine-readable code.
 */
export class KnowledgeError extends Error {
  readonly code: KnowledgeErrorCode;
  readonly provider?: ProviderMetadata;
  readonly recoverable: boolean;

  constructor(
    code: KnowledgeErrorCode,
    message: string,
    options?: {
      provider?: ProviderMetadata;
      recoverable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'KnowledgeError';
    this.code = code;
    this.provider = options?.provider;
    this.recoverable = options?.recoverable ?? false;
  }
}
