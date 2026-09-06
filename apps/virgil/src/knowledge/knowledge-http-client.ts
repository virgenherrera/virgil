import { Injectable } from '@nestjs/common';

export interface HttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface IHttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

@Injectable()
export class FetchHttpClient implements IHttpClient {
  /* v8 ignore start -- thin I/O boundary */
  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    const response = await fetch(url, { method: 'GET', headers });
    return {
      status: response.status,
      headers: { get: (name: string) => response.headers.get(name) },
      json: () => response.json() as Promise<unknown>,
      text: () => response.text(),
    };
  }
  /* v8 ignore stop */
}
