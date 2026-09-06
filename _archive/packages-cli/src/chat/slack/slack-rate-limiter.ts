/**
 * Exponential-backoff rate limiter with Retry-After header support,
 * designed for Slack Web API rate limits (HTTP 429) and transient
 * server errors (5xx).
 */

export interface RateLimiterOptions {
  /** Maximum retry attempts before propagating the error. */
  readonly maxRetries?: number;
  /** Base delay for the first retry, in milliseconds. */
  readonly initialDelayMs?: number;
  /** Upper bound for any computed delay, in milliseconds. */
  readonly maxDelayMs?: number;
  /** Injected sleep function for deterministic tests. */
  readonly sleepFn?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 32_000;

export class SlackRateLimiter {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: RateLimiterOptions = {}) {
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.sleepFn =
      options.sleepFn ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Executes `fn`, retrying on rate-limit (429) and transient server
   * errors (5xx) with exponential backoff. Respects Retry-After headers
   * when present on the thrown error.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;

    for (;;) {
      try {
        return await fn();
      } catch (error: unknown) {
        attempt += 1;

        if (attempt > this.maxRetries || !this.isRetryable(error)) {
          throw error;
        }

        const delay = this.computeDelay(attempt, error);
        await this.sleepFn(delay);
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as { status?: number }).status;
    return status === 429 || (status !== undefined && status >= 500);
  }

  private computeDelay(attempt: number, error: unknown): number {
    const retryAfter = (error as { retryAfter?: number }).retryAfter;
    if (retryAfter && retryAfter > 0) {
      return retryAfter * 1_000;
    }
    const exponential = this.initialDelayMs * Math.pow(2, attempt - 1);
    return Math.min(exponential, this.maxDelayMs);
  }
}
