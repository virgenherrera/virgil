/**
 * Injectable HTTP client for the Slack Web API. The concrete
 * `DefaultSlackHttpClient` calls the real API; tests inject a mock.
 */

/** Raw envelope returned by every Slack Web API method. */
export interface SlackApiResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly response_metadata?: { next_cursor?: string };
  readonly [key: string]: unknown;
}

/** DI token for the Slack HTTP client port. */
export const SLACK_HTTP_CLIENT = Symbol('SLACK_HTTP_CLIENT');

/** Port interface consumed by the Slack chat adapter. */
export interface SlackHttpClient {
  call(
    method: string,
    params: Record<string, string>,
  ): Promise<SlackApiResponse>;
}

/** Configuration needed to construct a `DefaultSlackHttpClient`. */
export interface SlackHttpClientConfig {
  readonly token: string;
  readonly baseUrl?: string;
}

/**
 * Production `SlackHttpClient` that calls the Slack Web API over HTTPS.
 * Throws on non-2xx HTTP responses, attaching `status` and an optional
 * `retryAfter` (seconds) so the rate limiter can honour Retry-After headers.
 */
export class DefaultSlackHttpClient implements SlackHttpClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: SlackHttpClientConfig) {
    this.baseUrl = config.baseUrl ?? 'https://slack.com/api';
    this.token = config.token;
  }

  async call(
    method: string,
    params: Record<string, string>,
  ): Promise<SlackApiResponse> {
    const url = new URL(`${this.baseUrl}/${method}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      const error = Object.assign(
        new Error(`Slack API ${method}: HTTP ${response.status}`),
        {
          status: response.status,
          retryAfter: retryAfter ? Number(retryAfter) : undefined,
        },
      );
      throw error;
    }

    return response.json() as Promise<SlackApiResponse>;
  }
}
