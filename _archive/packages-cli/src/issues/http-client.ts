import { Injectable } from '@nestjs/common';

/**
 * A minimal HTTP response envelope used by the GitHub adapters. Decoupled
 * from the native `fetch` Response so consumers depend only on the shape
 * they need, and tests can inject a lightweight mock.
 */
export interface HttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/**
 * Minimal HTTP client contract injected into the GitHub API adapter.
 * The indirection boundary lives here — not inside the adapter — so
 * integration tests can supply a fixture-backed implementation without
 * touching the network.
 */
export interface IHttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

/** Injection token used by NestJS DI to resolve {@link IHttpClient}. */
export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

/**
 * Default production HTTP client that delegates to the native `fetch` API.
 * Injected as the {@link HTTP_CLIENT} token when no test override is present.
 */
@Injectable()
export class FetchHttpClient implements IHttpClient {
  /* v8 ignore start -- thin I/O boundary; exercised at runtime, not in tests */
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
    };
  }
  /* v8 ignore stop */
}
