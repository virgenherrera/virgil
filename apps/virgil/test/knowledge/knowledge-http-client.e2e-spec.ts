import { FetchHttpClient } from '../../src/knowledge/knowledge-http-client.js';
import type { IHttpClient, HttpResponse } from '../../src/knowledge/knowledge-http-client.js';

describe('FetchHttpClient', () => {
  it('implements IHttpClient interface', () => {
    const client = new FetchHttpClient();
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
  });

  it('is instantiable as IHttpClient', () => {
    const client: IHttpClient = new FetchHttpClient();
    expect(client).toBeDefined();
  });
});

describe('HttpResponse interface', () => {
  it('defines the expected shape', () => {
    const response: HttpResponse = {
      status: 200,
      headers: { get: (_name: string) => null },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    };
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBeNull();
  });
});
