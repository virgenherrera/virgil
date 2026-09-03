import { Command, CommandRunner } from 'nest-commander';
import { DmrClientService } from '../services/index.js';

const WORKER_THRESHOLD = 0.66;
const REASONING_THRESHOLD = 0.66;

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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

@Command({
  name: 'benchmark',
  description: 'Run tier qualification fixtures against a model',
  arguments: '<model>',
})
export class BenchmarkCommand extends CommandRunner {
  constructor(private readonly dmr: DmrClientService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const modelName = passedParams[0];
    if (!modelName) {
      console.error('Usage: pnpm probe benchmark <model-name>');
      process.exit(1);
    }

    console.log(
      `Benchmarking model "${modelName}" against tier qualification fixtures...\n`,
    );

    let models;
    try {
      models = await this.dmr.fetchModels();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        console.error(
          'ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?',
        );
        process.exit(1);
      }
      throw err;
    }

    const modelExists = models.data?.some(
      (m: { id: string }) => m.id === modelName,
    );
    if (!modelExists) {
      console.error(`ERROR: Model "${modelName}" not found in DMR.`);
      console.error(
        `Available models: ${models.data?.map((m: { id: string }) => m.id).join(', ') || '(none)'}`,
      );
      process.exit(1);
    }

    const fixtures: FixtureResult[] = [];

    console.log('  [1/4] Structured JSON output...');
    const jsonAttempts = await this.dmr.fixtureStructuredJson(modelName);
    const jsonPassRate =
      jsonAttempts.filter((a: FixtureAttempt) => a.strict_correct).length /
      jsonAttempts.length;
    fixtures.push({
      name: 'structured_json',
      attempts: jsonAttempts,
      pass_rate: jsonPassRate,
      avg_latency_ms: Math.round(
        jsonAttempts.reduce(
          (s: number, a: FixtureAttempt) => s + a.elapsed_ms,
          0,
        ) / jsonAttempts.length,
      ),
    });
    console.log(
      `         ${(jsonPassRate * 100).toFixed(0)}% pass (${jsonAttempts.filter((a: FixtureAttempt) => a.strict_correct).length}/${jsonAttempts.length})`,
    );

    console.log('  [2/4] Classification...');
    const classAttempts = await this.dmr.fixtureClassification(modelName);
    const classPassRate =
      classAttempts.filter((a: FixtureAttempt) => a.strict_correct).length /
      classAttempts.length;
    fixtures.push({
      name: 'classification',
      attempts: classAttempts,
      pass_rate: classPassRate,
      avg_latency_ms: Math.round(
        classAttempts.reduce(
          (s: number, a: FixtureAttempt) => s + a.elapsed_ms,
          0,
        ) / classAttempts.length,
      ),
    });
    console.log(
      `         ${(classPassRate * 100).toFixed(0)}% pass (${classAttempts.filter((a: FixtureAttempt) => a.strict_correct).length}/${classAttempts.length})`,
    );

    console.log('  [3/4] Bug diagnosis...');
    const diagAttempts = await this.dmr.fixtureDiagnosis(modelName);
    const diagPassRate =
      diagAttempts.filter((a: FixtureAttempt) => a.strict_correct).length /
      diagAttempts.length;
    fixtures.push({
      name: 'diagnosis',
      attempts: diagAttempts,
      pass_rate: diagPassRate,
      avg_latency_ms: Math.round(
        diagAttempts.reduce(
          (s: number, a: FixtureAttempt) => s + a.elapsed_ms,
          0,
        ) / diagAttempts.length,
      ),
    });
    console.log(
      `         ${(diagPassRate * 100).toFixed(0)}% pass (${diagAttempts.filter((a: FixtureAttempt) => a.strict_correct).length}/${diagAttempts.length})`,
    );

    console.log('  [4/4] Latency measurement...');
    const latencies = await this.dmr.fixtureLatency(modelName);
    const p50 = median(latencies);
    const p95 = percentile(latencies, 95);
    console.log(`         p50: ${p50}ms, p95: ${p95}ms\n`);

    const workerScore = (jsonPassRate + classPassRate) / 2;
    const reasoningScore = (jsonPassRate + classPassRate + diagPassRate) / 3;

    const worker =
      workerScore >= WORKER_THRESHOLD ? 'qualified' : 'unqualified';
    const reasoning =
      reasoningScore >= REASONING_THRESHOLD ? 'qualified' : 'unqualified';
    const pro = 'untested';

    const result: BenchmarkResult = {
      model: modelName,
      fixtures,
      latency: { p50_ms: p50, p95_ms: p95, samples: latencies },
      qualification: { worker, reasoning, pro },
    };

    console.log('--- Qualification Verdict ---');
    console.log(
      `  Worker:    ${worker} (${(workerScore * 100).toFixed(0)}%, threshold: ${WORKER_THRESHOLD * 100}%)`,
    );
    console.log(
      `  Reasoning: ${reasoning} (${(reasoningScore * 100).toFixed(0)}%, threshold: ${REASONING_THRESHOLD * 100}%)`,
    );
    console.log(`  Pro:       ${pro}`);
    console.log();
    console.log('--- Full Results (JSON) ---');
    console.log(JSON.stringify(result, null, 2));
  }
}
