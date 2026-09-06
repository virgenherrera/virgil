import { SlackRateLimiter } from '../../src/chat/slack/slack-rate-limiter.js';

describe('SlackRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on first success', async () => {
    const limiter = new SlackRateLimiter();
    const result = await limiter.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('retries on 429 and eventually succeeds', async () => {
    const limiter = new SlackRateLimiter({
      maxRetries: 3,
      initialDelayMs: 100,
    });

    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        const err = Object.assign(new Error('rate limited'), { status: 429 });
        return Promise.reject(err);
      }
      return Promise.resolve('success');
    });

    const promise = limiter.execute(fn);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on 5xx errors', async () => {
    const limiter = new SlackRateLimiter({
      maxRetries: 2,
      initialDelayMs: 100,
    });

    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        const err = Object.assign(new Error('server error'), { status: 500 });
        return Promise.reject(err);
      }
      return Promise.resolve('recovered');
    });

    const promise = limiter.execute(fn);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('recovered');
  });

  it('does not retry on non-retryable errors (e.g. 400)', async () => {
    const limiter = new SlackRateLimiter({ maxRetries: 3 });

    const err = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(limiter.execute(fn)).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry plain errors without status', async () => {
    const limiter = new SlackRateLimiter({ maxRetries: 3 });
    const fn = vi.fn().mockRejectedValue(new Error('unknown'));

    await expect(limiter.execute(fn)).rejects.toThrow('unknown');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting max retries', async () => {
    const delays: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const limiter = new SlackRateLimiter({
      maxRetries: 2,
      initialDelayMs: 50,
      sleepFn,
    });

    const err = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(limiter.execute(fn)).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff delays', async () => {
    const delays: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const limiter = new SlackRateLimiter({
      maxRetries: 3,
      initialDelayMs: 1000,
      sleepFn,
    });

    const err = Object.assign(new Error('rate limited'), { status: 429 });
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt <= 3) return Promise.reject(err);
      return Promise.resolve('done');
    });

    await limiter.execute(fn);

    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('respects Retry-After header on error', async () => {
    const delays: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const limiter = new SlackRateLimiter({
      maxRetries: 1,
      sleepFn,
    });

    const err = Object.assign(new Error('rate limited'), {
      status: 429,
      retryAfter: 5,
    });
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(err);
      return Promise.resolve('ok');
    });

    await limiter.execute(fn);

    expect(delays).toEqual([5000]);
  });

  it('caps delay at maxDelayMs', async () => {
    const delays: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const limiter = new SlackRateLimiter({
      maxRetries: 5,
      initialDelayMs: 10000,
      maxDelayMs: 15000,
      sleepFn,
    });

    const err = Object.assign(new Error('rate limited'), { status: 429 });
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt <= 2) return Promise.reject(err);
      return Promise.resolve('done');
    });

    await limiter.execute(fn);

    expect(delays[0]).toBe(10000);
    expect(delays[1]).toBe(15000);
  });

  it('uses default options when none provided', () => {
    const limiter = new SlackRateLimiter();
    expect(limiter).toBeDefined();
  });
});
