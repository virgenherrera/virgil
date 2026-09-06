import type { ProviderMetadata } from '../shared/provider.types.js';

/**
 * Structured error surfaced by chat provider adapters. Carries the
 * originating provider's metadata and a machine-readable error code.
 */
export class ChatError extends Error {
  readonly code: string;
  readonly provider?: ProviderMetadata;
  readonly recoverable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      provider?: ProviderMetadata;
      recoverable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ChatError';
    this.code = options.code;
    this.provider = options.provider;
    this.recoverable = options.recoverable ?? false;
  }
}
