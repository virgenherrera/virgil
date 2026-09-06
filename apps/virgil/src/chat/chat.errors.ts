import type { ProviderMetadata } from '../shared/provider.types.js';

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
