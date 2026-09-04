import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { DmrClientService } from '../src/services/index.js';

function mockResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: () => Promise.resolve(body),
  } as Response;
}

function chatResponse(content: string): object {
  return {
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
      },
    ],
  };
}

describe('DmrClientService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: DmrClientService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    service = moduleRef.get(DmrClientService);
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  // ── fetchModels ────────────────────────────────────────────────────

  describe('fetchModels()', () => {
    it('returns parsed models response on success', async () => {
      const body = {
        object: 'list',
        data: [
          { id: 'ai/llama3.1:8b', object: 'model' },
          { id: 'ai/mistral:7b', object: 'model' },
        ],
      };
      fetchSpy.mockResolvedValueOnce(mockResponse(body));

      const result = await service.fetchModels();

      expect(result.object).toBe('list');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('ai/llama3.1:8b');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:12434/v1/models',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('throws on HTTP error response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse(
          {},
          { ok: false, status: 500, statusText: 'Internal Server Error' },
        ),
      );

      await expect(service.fetchModels()).rejects.toThrow(
        'HTTP 500: Internal Server Error',
      );
    });

    it('throws when Zod validation fails', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ wrong: 'shape' }));

      await expect(service.fetchModels()).rejects.toThrow();
    });

    it('throws when fetch itself rejects', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('fetch failed'));

      await expect(service.fetchModels()).rejects.toThrow('fetch failed');
    });
  });

  // ── chatCompletion ─────────────────────────────────────────────────

  describe('chatCompletion()', () => {
    it('returns content and elapsed time on success', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse(chatResponse('Hello there!')),
      );

      const result = await service.chatCompletion(
        'ai/test-model',
        'You are helpful.',
        'Say hello.',
      );

      expect(result.content).toBe('Hello there!');
      expect(typeof result.elapsed_ms).toBe('number');
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:12434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"model":"ai/test-model"'),
        }),
      );
    });

    it('uses custom maxTokens and temperature', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(chatResponse('custom')));

      await service.chatCompletion('model', 'sys', 'usr', {
        maxTokens: 512,
        temperature: 0.7,
      });

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(callBody.max_tokens).toBe(512);
      expect(callBody.temperature).toBe(0.7);
    });

    it('throws on HTTP error response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse(
          {},
          { ok: false, status: 503, statusText: 'Service Unavailable' },
        ),
      );

      await expect(
        service.chatCompletion('model', 'sys', 'usr'),
      ).rejects.toThrow('HTTP 503: Service Unavailable');
    });
  });

  // ── fixtureStructuredJson ──────────────────────────────────────────

  describe('fixtureStructuredJson()', () => {
    it('returns 3 attempts with correct classification', async () => {
      const correctJson = JSON.stringify({
        path: 'src/auth/login.ts',
        category: 'auth',
        confidence: 0.95,
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(correctJson)));

      const attempts = await service.fixtureStructuredJson('ai/test-model');

      expect(attempts).toHaveLength(3);
      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(true);
        expect(typeof a.elapsed_ms).toBe('number');
        expect(typeof a.attempt).toBe('number');
      }
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('marks json_valid=false for non-JSON responses', async () => {
      fetchSpy.mockResolvedValue(mockResponse(chatResponse('not json at all')));

      const attempts = await service.fixtureStructuredJson('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(false);
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false when fields are wrong', async () => {
      const wrongJson = JSON.stringify({
        path: 'wrong/path.ts',
        category: 'api',
        confidence: 0.5,
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(wrongJson)));

      const attempts = await service.fixtureStructuredJson('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false when confidence is out of range', async () => {
      const badConfidence = JSON.stringify({
        path: 'src/auth/login.ts',
        category: 'auth',
        confidence: 1.5,
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(badConfidence)));

      const attempts = await service.fixtureStructuredJson('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(false);
      }
    });
  });

  // ── fixtureClassification ──────────────────────────────────────────

  describe('fixtureClassification()', () => {
    it('returns 3 attempts with correct module grouping', async () => {
      const correctJson = JSON.stringify({
        modules: [
          {
            name: 'auth',
            files: ['src/auth/login.ts', 'src/auth/register.ts'],
          },
          { name: 'api', files: ['src/api/users.ts', 'src/api/posts.ts'] },
          { name: 'ui', files: ['src/ui/Button.tsx'] },
        ],
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(correctJson)));

      const attempts = await service.fixtureClassification('ai/test-model');

      expect(attempts).toHaveLength(3);
      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(true);
      }
    });

    it('marks strict_correct=false when modules are fewer than 3', async () => {
      const tooFew = JSON.stringify({
        modules: [
          { name: 'all', files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'] },
        ],
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(tooFew)));

      const attempts = await service.fixtureClassification('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false when total file count is not 5', async () => {
      const wrongCount = JSON.stringify({
        modules: [
          { name: 'auth', files: ['a.ts'] },
          { name: 'api', files: ['b.ts'] },
          { name: 'ui', files: ['c.ts'] },
        ],
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(wrongCount)));

      const attempts = await service.fixtureClassification('ai/test-model');

      for (const a of attempts) {
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false for non-JSON responses', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse(chatResponse('I grouped the files...')),
      );

      const attempts = await service.fixtureClassification('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(false);
        expect(a.strict_correct).toBe(false);
      }
    });
  });

  // ── fixtureDiagnosis ───────────────────────────────────────────────

  describe('fixtureDiagnosis()', () => {
    it('returns 3 attempts with correct diagnosis', async () => {
      const correctJson = JSON.stringify({
        bug: 'The function subtracts instead of adding',
        fix: 'return a + b;',
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(correctJson)));

      const attempts = await service.fixtureDiagnosis('ai/test-model');

      expect(attempts).toHaveLength(3);
      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(true);
      }
    });

    it('marks strict_correct=false when fix does not include "a + b"', async () => {
      const wrongFix = JSON.stringify({
        bug: 'Wrong operator',
        fix: 'return a * b;',
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(wrongFix)));

      const attempts = await service.fixtureDiagnosis('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(true);
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false when bug description is empty', async () => {
      const emptyBug = JSON.stringify({
        bug: '',
        fix: 'return a + b;',
      });
      fetchSpy.mockResolvedValue(mockResponse(chatResponse(emptyBug)));

      const attempts = await service.fixtureDiagnosis('ai/test-model');

      for (const a of attempts) {
        expect(a.strict_correct).toBe(false);
      }
    });

    it('marks strict_correct=false for non-JSON responses', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse(chatResponse('The bug is subtraction.')),
      );

      const attempts = await service.fixtureDiagnosis('ai/test-model');

      for (const a of attempts) {
        expect(a.json_valid).toBe(false);
        expect(a.strict_correct).toBe(false);
      }
    });
  });

  // ── fixtureLatency ─────────────────────────────────────────────────

  describe('fixtureLatency()', () => {
    it('collects the specified number of latency samples', async () => {
      fetchSpy.mockResolvedValue(mockResponse(chatResponse('hello')));

      const latencies = await service.fixtureLatency('ai/test-model', 3);

      expect(latencies).toHaveLength(3);
      for (const l of latencies) {
        expect(typeof l).toBe('number');
        expect(l).toBeGreaterThanOrEqual(0);
      }
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('defaults to 5 samples', async () => {
      fetchSpy.mockResolvedValue(mockResponse(chatResponse('hello')));

      const latencies = await service.fixtureLatency('ai/test-model');

      expect(latencies).toHaveLength(5);
      expect(fetchSpy).toHaveBeenCalledTimes(5);
    });

    it('passes maxTokens: 16 for latency measurements', async () => {
      fetchSpy.mockResolvedValue(mockResponse(chatResponse('hi')));

      await service.fixtureLatency('ai/test-model', 1);

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(callBody.max_tokens).toBe(16);
    });
  });
});
