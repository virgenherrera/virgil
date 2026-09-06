import { ChatError } from '../../src/chat/chat.errors.js';
import type { ProviderMetadata } from '../../src/shared/provider.types.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';
import type { SemVer } from '../../src/shared/primitives.js';

describe('ChatError', () => {
  it('creates a structured error with code and message', () => {
    const error = new ChatError('Something failed', {
      code: 'SEARCH_FAILED',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ChatError');
    expect(error.code).toBe('SEARCH_FAILED');
    expect(error.message).toBe('Something failed');
    expect(error.recoverable).toBe(false);
    expect(error.provider).toBeUndefined();
  });

  it('accepts optional provider metadata', () => {
    const provider: ProviderMetadata = {
      id: 'slack-chat',
      name: 'Slack Chat',
      version: '0.0.1' as SemVer,
      capabilities: [ProviderCapability.CHAT],
    };
    const error = new ChatError('Auth failed', {
      code: 'AUTH_FAILED',
      provider,
    });
    expect(error.provider).toEqual(provider);
  });

  it('accepts optional recoverable flag', () => {
    const error = new ChatError('Rate limited', {
      code: 'RATE_LIMITED',
      recoverable: true,
    });
    expect(error.recoverable).toBe(true);
  });

  it('defaults recoverable to false', () => {
    const error = new ChatError('Not found', {
      code: 'NOT_FOUND',
    });
    expect(error.recoverable).toBe(false);
  });

  it('preserves cause chain', () => {
    const original = new Error('network timeout');
    const error = new ChatError('Request failed', {
      code: 'HTTP_ERROR',
      cause: original,
    });
    expect(error.cause).toBe(original);
  });
});
