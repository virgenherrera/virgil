import {
  DefaultSlackHttpClient,
  SLACK_HTTP_CLIENT,
} from '../../src/chat/slack/slack-http.client.js';

describe('SLACK_HTTP_CLIENT', () => {
  it('is a unique symbol token', () => {
    expect(typeof SLACK_HTTP_CLIENT).toBe('symbol');
    expect(SLACK_HTTP_CLIENT.toString()).toContain('SLACK_HTTP_CLIENT');
  });
});

describe('DefaultSlackHttpClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('constructs with default base URL', () => {
    const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });
    expect(client).toBeDefined();
  });

  it('constructs with custom base URL', () => {
    const client = new DefaultSlackHttpClient({
      token: 'xoxb-test',
      baseUrl: 'https://custom.slack.com/api',
    });
    expect(client).toBeDefined();
  });

  it('calls the correct URL with authorization header', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ ok: true, user: 'bot' }),
      headers: new Headers(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new DefaultSlackHttpClient({ token: 'xoxb-my-token' });
    const result = await client.call('auth.test', { foo: 'bar' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('auth.test'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer xoxb-my-token' },
      }),
    );
    expect(result).toEqual({ ok: true, user: 'bot' });
  });

  it('passes query parameters in the URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
      headers: new Headers(),
    });

    const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });
    await client.call('search.messages', { query: 'hello', count: '10' });

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledUrl).toContain('query=hello');
    expect(calledUrl).toContain('count=10');
  });

  it('throws error with status on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
    });

    const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });

    try {
      await client.call('auth.test', {});
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('HTTP 429');
      expect((error as { status: number }).status).toBe(429);
      expect((error as { retryAfter: number }).retryAfter).toBe(30);
    }
  });

  it('throws error without retryAfter when header absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });

    try {
      await client.call('chat.postMessage', {});
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as { status: number }).status).toBe(500);
      expect((error as { retryAfter?: number }).retryAfter).toBeUndefined();
    }
  });
});
