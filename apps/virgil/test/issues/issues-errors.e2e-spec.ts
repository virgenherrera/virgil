import { IssuesError, IssuesErrorCode } from '../../src/issues/issues.errors.js';

describe('IssuesError', () => {
  it('sets code, message, and name', () => {
    const error = new IssuesError(IssuesErrorCode.NOT_FOUND, 'Issue not found');
    expect(error.code).toBe(IssuesErrorCode.NOT_FOUND);
    expect(error.message).toBe('Issue not found');
    expect(error.name).toBe('IssuesError');
  });

  it('sets cause when provided', () => {
    const cause = new Error('root cause');
    const error = new IssuesError(IssuesErrorCode.HTTP_ERROR, 'Failed', { cause });
    expect(error.cause).toBe(cause);
  });

  it('omits cause when not provided', () => {
    const error = new IssuesError(IssuesErrorCode.PARSE_ERROR, 'Parse failed');
    expect(error.cause).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const error = new IssuesError(IssuesErrorCode.RATE_LIMITED, 'Rate limited');
    expect(error).toBeInstanceOf(Error);
  });

  it('preserves all error codes', () => {
    expect(IssuesErrorCode.NOT_INITIALISED).toBe('NOT_INITIALISED');
    expect(IssuesErrorCode.HTTP_ERROR).toBe('HTTP_ERROR');
    expect(IssuesErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(IssuesErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(IssuesErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(IssuesErrorCode.AUTH_FAILED).toBe('AUTH_FAILED');
    expect(IssuesErrorCode.CDP_UNAVAILABLE).toBe('CDP_UNAVAILABLE');
  });
});
