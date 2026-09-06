import { Injectable } from '@nestjs/common';

export interface HttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export interface IHttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

@Injectable()
export class FetchHttpClient implements IHttpClient {
  /* v8 ignore start */
  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    const response = await fetch(url, { method: 'GET', headers });
    return {
      status: response.status,
      headers: { get: (name: string) => response.headers.get(name) },
      json: () => response.json() as Promise<unknown>,
    };
  }
  /* v8 ignore stop */
}
