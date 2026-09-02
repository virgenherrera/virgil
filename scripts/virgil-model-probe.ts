#!/usr/bin/env -S npx tsx
/**
 * virgil-model-probe — CLI to probe DMR models, benchmark tier qualification,
 * and select a model for local minion use.
 *
 * Usage:
 *   npx tsx scripts/virgil-model-probe.ts probe
 *   npx tsx scripts/virgil-model-probe.ts benchmark <model-name>
 *   npx tsx scripts/virgil-model-probe.ts select <model-name>
 *
 * Requires Docker Model Runner (DMR) at localhost:12434.
 * No external dependencies — Node.js built-ins only.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DMR_BASE = "http://localhost:12434";
const DMR_MODELS_URL = `${DMR_BASE}/v1/models`;
const DMR_CHAT_URL = `${DMR_BASE}/v1/chat/completions`;

const FIXTURE_ATTEMPTS = 3;
const WORKER_THRESHOLD = 0.66;
const REASONING_THRESHOLD = 0.66;
const FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelEntry {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  [key: string]: unknown;
}

interface ModelsResponse {
  object: string;
  data: ModelEntry[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

interface ChatResponse {
  id: string;
  choices: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface FixtureAttempt {
  attempt: number;
  elapsed_ms: number;
  json_valid: boolean;
  strict_correct: boolean;
  raw_content: string;
}

interface FixtureResult {
  name: string;
  attempts: FixtureAttempt[];
  pass_rate: number;
  avg_latency_ms: number;
}

interface BenchmarkResult {
  model: string;
  fixtures: FixtureResult[];
  latency: { p50_ms: number; p95_ms: number; samples: number[] };
  qualification: { worker: string; reasoning: string; pro: string };
}

interface VirgilConfig {
  $schema: string;
  version: string;
  localMinions: {
    ceiling: string;
    allowedTiers: string[];
    model: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRepoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
}

function getConfigPath(): string {
  return join(getRepoRoot(), "virgil.json");
}

async function dmrFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  maxTokens = 256,
): Promise<{ content: string; elapsed_ms: number }> {
  const start = performance.now();
  const res = await dmrFetch<ChatResponse>(DMR_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
    }),
  });
  const elapsed_ms = Math.round(performance.now() - start);
  const content = res.choices?.[0]?.message?.content?.trim() ?? "";
  return { content, elapsed_ms };
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Fixtures — W5-style tier qualification tests
// ---------------------------------------------------------------------------

/** Fixture 1: Can the model produce valid, correct JSON? */
async function fixtureStructuredJson(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a code classifier. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        'Classify this file path into a category. Path: "src/auth/login.ts". ' +
        "Respond with exactly this JSON structure: " +
        '{"path": "<the path>", "category": "<one of: auth, api, ui, config, test, other>", "confidence": <number between 0 and 1>}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        strict_correct =
          parsed.path === "src/auth/login.ts" &&
          parsed.category === "auth" &&
          typeof parsed.confidence === "number" &&
          parsed.confidence >= 0 &&
          parsed.confidence <= 1;
      } catch {
        /* noop */
      }
    }
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

/** Fixture 2: Can the model classify text into categories? */
async function fixtureClassification(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a repository analyzer. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        "Group these files by module: " +
        "src/auth/login.ts, src/auth/register.ts, src/api/users.ts, src/api/posts.ts, src/ui/Button.tsx. " +
        "Respond with exactly this JSON structure: " +
        '{"modules": [{"name": "<module name>", "files": ["<file1>", "<file2>"]}]}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.modules) && parsed.modules.length >= 3) {
          const allFilesPresent = parsed.modules.every(
            (m: { name: string; files: string[] }) =>
              typeof m.name === "string" && Array.isArray(m.files) && m.files.length > 0,
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
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

/** Fixture 3: Can the model identify a simple bug? */
async function fixtureDiagnosis(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a test-failure diagnostician. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        "A test failed with this output:\n\n" +
        "```\n" +
        "FAIL src/utils/math.test.ts\n" +
        "  add(2, 3)\n" +
        "    Expected: 5\n" +
        "    Received: -1\n" +
        "```\n\n" +
        "The function is:\n" +
        "```typescript\n" +
        "function add(a: number, b: number): number {\n" +
        "  return a - b;\n" +
        "}\n" +
        "```\n\n" +
        "Respond with exactly this JSON structure: " +
        '{"bug": "<one-line description of the bug>", "fix": "<the corrected return statement>"}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        strict_correct =
          typeof parsed.bug === "string" &&
          parsed.bug.length > 0 &&
          typeof parsed.fix === "string" &&
          parsed.fix.includes("a + b");
      } catch {
        /* noop */
      }
    }
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

/** Fixture 4: Latency test — measures response time for trivial prompts */
async function fixtureLatency(
  model: string,
  samples = 5,
): Promise<number[]> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i++) {
    const { elapsed_ms } = await chatCompletion(
      model,
      [{ role: "user", content: "Say hello." }],
      16,
    );
    latencies.push(elapsed_ms);
  }
  return latencies;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdProbe(): Promise<void> {
  console.log(`Probing DMR at ${DMR_MODELS_URL} ...\n`);

  let models: ModelsResponse;
  try {
    models = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  if (!models.data || models.data.length === 0) {
    console.log("No models available in DMR.");
    console.log("Pull a model with: docker model pull <model-name>");
    return;
  }

  console.log(`Found ${models.data.length} model(s):\n`);

  for (const m of models.data) {
    console.log(`  ID:        ${m.id}`);
    console.log(`  Object:    ${m.object}`);
    if (m.created) {
      console.log(`  Created:   ${new Date(m.created * 1000).toISOString()}`);
    }
    if (m.owned_by) {
      console.log(`  Owned by:  ${m.owned_by}`);
    }
    // Print any additional fields from the model metadata
    const knownKeys = new Set(["id", "object", "created", "owned_by"]);
    for (const [key, value] of Object.entries(m)) {
      if (!knownKeys.has(key) && value !== undefined) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
    console.log();
  }
}

async function cmdBenchmark(modelName: string): Promise<void> {
  console.log(`Benchmarking model "${modelName}" against tier qualification fixtures...\n`);

  // Verify model exists
  let models: ModelsResponse;
  try {
    models = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  const modelExists = models.data?.some((m) => m.id === modelName);
  if (!modelExists) {
    console.error(`ERROR: Model "${modelName}" not found in DMR.`);
    console.error(`Available models: ${models.data?.map((m) => m.id).join(", ") || "(none)"}`);
    process.exit(1);
  }

  // Run fixtures
  const fixtures: FixtureResult[] = [];

  console.log("  [1/4] Structured JSON output...");
  const jsonAttempts = await fixtureStructuredJson(modelName);
  const jsonPassRate =
    jsonAttempts.filter((a) => a.strict_correct).length / jsonAttempts.length;
  fixtures.push({
    name: "structured_json",
    attempts: jsonAttempts,
    pass_rate: jsonPassRate,
    avg_latency_ms: Math.round(
      jsonAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / jsonAttempts.length,
    ),
  });
  console.log(
    `         ${(jsonPassRate * 100).toFixed(0)}% pass (${jsonAttempts.filter((a) => a.strict_correct).length}/${jsonAttempts.length})`,
  );

  console.log("  [2/4] Classification...");
  const classAttempts = await fixtureClassification(modelName);
  const classPassRate =
    classAttempts.filter((a) => a.strict_correct).length / classAttempts.length;
  fixtures.push({
    name: "classification",
    attempts: classAttempts,
    pass_rate: classPassRate,
    avg_latency_ms: Math.round(
      classAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / classAttempts.length,
    ),
  });
  console.log(
    `         ${(classPassRate * 100).toFixed(0)}% pass (${classAttempts.filter((a) => a.strict_correct).length}/${classAttempts.length})`,
  );

  console.log("  [3/4] Bug diagnosis...");
  const diagAttempts = await fixtureDiagnosis(modelName);
  const diagPassRate =
    diagAttempts.filter((a) => a.strict_correct).length / diagAttempts.length;
  fixtures.push({
    name: "diagnosis",
    attempts: diagAttempts,
    pass_rate: diagPassRate,
    avg_latency_ms: Math.round(
      diagAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / diagAttempts.length,
    ),
  });
  console.log(
    `         ${(diagPassRate * 100).toFixed(0)}% pass (${diagAttempts.filter((a) => a.strict_correct).length}/${diagAttempts.length})`,
  );

  console.log("  [4/4] Latency measurement...");
  const latencies = await fixtureLatency(modelName);
  const p50 = median(latencies);
  const p95 = percentile(latencies, 95);
  console.log(`         p50: ${p50}ms, p95: ${p95}ms\n`);

  // Qualification
  const workerScore = (jsonPassRate + classPassRate) / 2;
  const reasoningScore = (jsonPassRate + classPassRate + diagPassRate) / 3;

  const worker =
    workerScore >= WORKER_THRESHOLD ? "qualified" : "unqualified";
  const reasoning =
    reasoningScore >= REASONING_THRESHOLD ? "qualified" : "unqualified";
  const pro = "untested"; // Pro requires dedicated benchmark + owner approval

  const result: BenchmarkResult = {
    model: modelName,
    fixtures,
    latency: { p50_ms: p50, p95_ms: p95, samples: latencies },
    qualification: { worker, reasoning, pro },
  };

  // Summary
  console.log("--- Qualification Verdict ---");
  console.log(`  Worker:    ${worker} (${(workerScore * 100).toFixed(0)}%, threshold: ${WORKER_THRESHOLD * 100}%)`);
  console.log(`  Reasoning: ${reasoning} (${(reasoningScore * 100).toFixed(0)}%, threshold: ${REASONING_THRESHOLD * 100}%)`);
  console.log(`  Pro:       ${pro}`);
  console.log();

  // Output full JSON to stderr for piping
  console.log("--- Full Results (JSON) ---");
  console.log(JSON.stringify(result, null, 2));
}

async function cmdSelect(modelName: string): Promise<void> {
  // Verify model exists in DMR
  let models: ModelsResponse;
  try {
    models = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  const modelExists = models.data?.some((m) => m.id === modelName);
  if (!modelExists) {
    console.error(`ERROR: Model "${modelName}" not found in DMR.`);
    console.error(`Available models: ${models.data?.map((m) => m.id).join(", ") || "(none)"}`);
    process.exit(1);
  }

  // Update virgil.json
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    console.error("ERROR: virgil.json not found at project root.");
    process.exit(1);
  }

  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw) as VirgilConfig;

  config.localMinions.model = modelName;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  console.log(`Model selected: "${modelName}"`);
  console.log(`Updated virgil.json at ${configPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, arg1] = process.argv.slice(2);

  switch (command) {
    case "probe":
      await cmdProbe();
      break;
    case "benchmark":
      if (!arg1) {
        console.error("Usage: virgil-model-probe benchmark <model-name>");
        process.exit(1);
      }
      await cmdBenchmark(arg1);
      break;
    case "select":
      if (!arg1) {
        console.error("Usage: virgil-model-probe select <model-name>");
        process.exit(1);
      }
      await cmdSelect(arg1);
      break;
    default:
      console.error("Usage: virgil-model-probe <probe|benchmark|select> [args...]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
