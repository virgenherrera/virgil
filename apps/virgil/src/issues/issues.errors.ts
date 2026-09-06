export enum IssuesErrorCode {
  NOT_INITIALISED = 'NOT_INITIALISED',
  HTTP_ERROR = 'HTTP_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTH_FAILED = 'AUTH_FAILED',
  CDP_UNAVAILABLE = 'CDP_UNAVAILABLE',
}

export class IssuesError extends Error {
  constructor(
    readonly code: IssuesErrorCode,
    message: string,
    options?: { cause?: unknown; recoverable?: boolean },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'IssuesError';
  }
}
