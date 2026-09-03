import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ModelsResponseSchema, ChatResponseSchema } from '../schemas/index.js';

const DMR_BASE = 'http://localhost:12434';
const DMR_MODELS_URL = `${DMR_BASE}/v1/models`;
const DMR_CHAT_URL = `${DMR_BASE}/v1/chat/completions`;
const FETCH_TIMEOUT_MS = 30_000;
const FIXTURE_ATTEMPTS = 3;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface FixtureAttempt {
  attempt: number;
  elapsed_ms: number;
  json_valid: boolean;
  strict_correct: boolean;
  raw_content: string;
}

type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

@Injectable()
export class DmrClientService {
  async fetchModels(): Promise<ModelsResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(DMR_MODELS_URL, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const raw = await res.json();
      return ModelsResponseSchema.parse(raw);
    } finally {
      clearTimeout(timer);
    }
  }

  async chatCompletion(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<{ content: string; elapsed_ms: number }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const maxTokens = options?.maxTokens ?? 256;
    const temperature = options?.temperature ?? 0;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const start = performance.now();
    try {
      const res = await fetch(DMR_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const raw = await res.json();
      const parsed = ChatResponseSchema.parse(raw);
      const elapsed_ms = Math.round(performance.now() - start);
      const content = parsed.choices?.[0]?.message?.content?.trim() ?? '';
      return { content, elapsed_ms };
    } finally {
      clearTimeout(timer);
    }
  }

  async fixtureStructuredJson(model: string): Promise<FixtureAttempt[]> {
    const systemPrompt =
      'You are a code classifier. Respond ONLY with a JSON object, no other text.';
    const userPrompt =
      'Classify this file path into a category. Path: "src/auth/login.ts". ' +
      'Respond with exactly this JSON structure: ' +
      '{"path": "<the path>", "category": "<one of: auth, api, ui, config, test, other>", "confidence": <number between 0 and 1>}';

    const attempts: FixtureAttempt[] = [];
    for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
      const { content, elapsed_ms } = await this.chatCompletion(
        model,
        systemPrompt,
        userPrompt,
      );
      const json_valid = this.isValidJson(content);
      let strict_correct = false;
      if (json_valid) {
        try {
          const parsed = JSON.parse(content);
          strict_correct =
            parsed.path === 'src/auth/login.ts' &&
            parsed.category === 'auth' &&
            typeof parsed.confidence === 'number' &&
            parsed.confidence >= 0 &&
            parsed.confidence <= 1;
        } catch {
          /* noop */
        }
      }
      attempts.push({
        attempt: i,
        elapsed_ms,
        json_valid,
        strict_correct,
        raw_content: content,
      });
    }
    return attempts;
  }

  async fixtureClassification(model: string): Promise<FixtureAttempt[]> {
    const systemPrompt =
      'You are a repository analyzer. Respond ONLY with a JSON object, no other text.';
    const userPrompt =
      'Group these files by module: ' +
      'src/auth/login.ts, src/auth/register.ts, src/api/users.ts, src/api/posts.ts, src/ui/Button.tsx. ' +
      'Respond with exactly this JSON structure: ' +
      '{"modules": [{"name": "<module name>", "files": ["<file1>", "<file2>"]}]}';

    const attempts: FixtureAttempt[] = [];
    for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
      const { content, elapsed_ms } = await this.chatCompletion(
        model,
        systemPrompt,
        userPrompt,
      );
      const json_valid = this.isValidJson(content);
      let strict_correct = false;
      if (json_valid) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.modules) && parsed.modules.length >= 3) {
            const allFilesPresent = parsed.modules.every(
              (m: { name: string; files: string[] }) =>
                typeof m.name === 'string' &&
                Array.isArray(m.files) &&
                m.files.length > 0,
            );
            const totalFiles = parsed.modules.reduce(
              (sum: number, m: { files: string[] }) => sum + m.files.length,
              0,
            );
            strict_correct = allFilesPresent && totalFiles === 5;
          }
        } catch {
          /* noop */
        }
      }
      attempts.push({
        attempt: i,
        elapsed_ms,
        json_valid,
        strict_correct,
        raw_content: content,
      });
    }
    return attempts;
  }

  async fixtureDiagnosis(model: string): Promise<FixtureAttempt[]> {
    const systemPrompt =
      'You are a test-failure diagnostician. Respond ONLY with a JSON object, no other text.';
    const userPrompt =
      'A test failed with this output:\n\n' +
      '```\n' +
      'FAIL src/utils/math.test.ts\n' +
      '  add(2, 3)\n' +
      '    Expected: 5\n' +
      '    Received: -1\n' +
      '```\n\n' +
      'The function is:\n' +
      '```typescript\n' +
      'function add(a: number, b: number): number {\n' +
      '  return a - b;\n' +
      '}\n' +
      '```\n\n' +
      'Respond with exactly this JSON structure: ' +
      '{"bug": "<one-line description of the bug>", "fix": "<the corrected return statement>"}';

    const attempts: FixtureAttempt[] = [];
    for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
      const { content, elapsed_ms } = await this.chatCompletion(
        model,
        systemPrompt,
        userPrompt,
      );
      const json_valid = this.isValidJson(content);
      let strict_correct = false;
      if (json_valid) {
        try {
          const parsed = JSON.parse(content);
          strict_correct =
            typeof parsed.bug === 'string' &&
            parsed.bug.length > 0 &&
            typeof parsed.fix === 'string' &&
            parsed.fix.includes('a + b');
        } catch {
          /* noop */
        }
      }
      attempts.push({
        attempt: i,
        elapsed_ms,
        json_valid,
        strict_correct,
        raw_content: content,
      });
    }
    return attempts;
  }

  async fixtureLatency(model: string, samples = 5): Promise<number[]> {
    const latencies: number[] = [];
    for (let i = 0; i < samples; i++) {
      const { elapsed_ms } = await this.chatCompletion(
        model,
        '',
        'Say hello.',
        { maxTokens: 16 },
      );
      latencies.push(elapsed_ms);
    }
    return latencies;
  }

  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}
