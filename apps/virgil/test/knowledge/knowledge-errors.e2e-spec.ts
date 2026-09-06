import { KnowledgeError, KnowledgeErrorCode } from '../../src/knowledge/knowledge.errors.js';

describe('KnowledgeErrorCode', () => {
  it('exposes all expected error codes', () => {
    expect(KnowledgeErrorCode.NOT_INITIALISED).toBe('NOT_INITIALISED');
    expect(KnowledgeErrorCode.HTTP_ERROR).toBe('HTTP_ERROR');
    expect(KnowledgeErrorCode.AUTH_FAILED).toBe('AUTH_FAILED');
    expect(KnowledgeErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(KnowledgeErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(KnowledgeErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(KnowledgeErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(KnowledgeErrorCode.CDP_ERROR).toBe('CDP_ERROR');
    expect(KnowledgeErrorCode.FILESYSTEM_ERROR).toBe('FILESYSTEM_ERROR');
    expect(KnowledgeErrorCode.UNSUPPORTED_TYPE).toBe('UNSUPPORTED_TYPE');
    expect(KnowledgeErrorCode.BOUNDARY_VIOLATION).toBe('BOUNDARY_VIOLATION');
  });

  it('contains exactly eleven members', () => {
    expect(Object.values(KnowledgeErrorCode)).toHaveLength(11);
  });
});

describe('KnowledgeError', () => {
  it('creates structured error with code and message', () => {
    const error = new KnowledgeError(
      KnowledgeErrorCode.HTTP_ERROR,
      'Connection failed',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('KnowledgeError');
    expect(error.code).toBe(KnowledgeErrorCode.HTTP_ERROR);
    expect(error.message).toBe('Connection failed');
    expect(error.recoverable).toBe(false);
    expect(error.provider).toBeUndefined();
  });

  it('accepts optional provider metadata', () => {
    const provider = {
      id: 'test-provider',
      name: 'Test',
      version: '0.1.0' as const,
      capabilities: [],
    };
    const error = new KnowledgeError(
      KnowledgeErrorCode.AUTH_FAILED,
      'Bad token',
      { provider: provider as any },
    );
    expect(error.provider).toEqual(provider);
  });

  it('accepts optional recoverable flag', () => {
    const error = new KnowledgeError(
      KnowledgeErrorCode.RATE_LIMITED,
      'Too many requests',
      { recoverable: true },
    );
    expect(error.recoverable).toBe(true);
  });

  it('defaults recoverable to false', () => {
    const error = new KnowledgeError(
      KnowledgeErrorCode.NOT_FOUND,
      'Missing page',
    );
    expect(error.recoverable).toBe(false);
  });

  it('preserves cause chain', () => {
    const original = new Error('network timeout');
    const error = new KnowledgeError(
      KnowledgeErrorCode.HTTP_ERROR,
      'Request failed',
      { cause: original },
    );
    expect(error.cause).toBe(original);
  });
});
