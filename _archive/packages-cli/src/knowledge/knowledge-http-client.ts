import { Injectable } from '@nestjs/common';

/**
 * Minimal HTTP response envelope used by knowledge adapters.
 * Decoupled from the native `fetch` Response for testability.
 */
export interface HttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * Minimal HTTP client contract injected into the Confluence API adapter.
 * Tests can supply a fixture-backed implementation without touching the network.
 */
export interface IHttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

/**
 * Default production HTTP client that delegates to the native `fetch` API.
 * Injected as the {@link HTTP_CLIENT} token when no test override is present.
 */
@Injectable()
export class FetchHttpClient implements IHttpClient {
  /* v8 ignore start -- thin I/O boundary */
  async get(
    url: string,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    const response = await fetch(url, { method: 'GET', headers });
    return {
      status: response.status,
      headers: {
        get: (name: string) => response.headers.get(name),
      },
      json: () => response.json() as Promise<unknown>,
      text: () => response.text(),
    };
  }
  /* v8 ignore stop */
}
