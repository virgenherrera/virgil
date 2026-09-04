import { Command, CommandRunner, Option } from 'nest-commander';
import { DmrClientService, ConfigService } from '../services/index.js';
import {
  DelegateOptionsSchema,
  DelegateResultSchema,
} from '../schemas/index.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '../probe.constants.js';

interface RawDelegateOptions {
  prompt?: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

@Command({
  name: 'delegate',
  description: 'Delegate a prompt to a local LLM via Docker Model Runner',
})
export class DelegateCommand extends CommandRunner {
  constructor(
    private readonly dmr: DmrClientService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  @Option({
    flags: '--prompt <text>',
    description: 'User prompt to send to the LLM (required)',
    required: true,
  })
  parsePrompt(val: string): string {
    return DelegateOptionsSchema.shape.prompt.parse(val);
  }

  @Option({
    flags: '--system <text>',
    description: 'System prompt (default: helpful assistant)',
  })
  parseSystem(val: string): string {
    return val;
  }

  @Option({
    flags: '--model <id>',
    description: 'Model ID (e.g., ai/llama3.2:latest)',
  })
  parseModel(val: string): string {
    return val;
  }

  @Option({
    flags: '--max-tokens <n>',
    description: `Max response tokens (default: ${DEFAULT_MAX_TOKENS})`,
  })
  parseMaxTokens(val: string): number {
    const result = DelegateOptionsSchema.shape.maxTokens
      .unwrap()
      .safeParse(val);
    if (!result.success) {
      throw new Error('--max-tokens must be a positive integer (max 131072).');
    }
    return result.data;
  }

  @Option({
    flags: '--temperature <n>',
    description: `Temperature (default: ${DEFAULT_TEMPERATURE})`,
  })
  parseTemperature(val: string): number {
    const result = DelegateOptionsSchema.shape.temperature
      .unwrap()
      .safeParse(val);
    if (!result.success) {
      throw new Error('--temperature must be between 0 and 2.');
    }
    return result.data;
  }

  async run(_args: string[], options: RawDelegateOptions): Promise<void> {
    const parsed = DelegateOptionsSchema.safeParse(options);
    if (!parsed.success) {
      console.error(`[delegate] ${parsed.error.issues[0].message}`);
      process.exit(1);
    }

    const {
      prompt,
      system = DEFAULT_SYSTEM_PROMPT,
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = DEFAULT_TEMPERATURE,
    } = parsed.data;

    const model = await this.resolveModel(parsed.data.model);
    if (!model) {
      console.error(
        '[delegate] No model available. Check DMR or set a model in virgil.json.',
      );
      process.exit(1);
    }

    let result: { content: string; elapsed_ms: number };
    try {
      result = await this.dmr.chatCompletion(model, system, prompt, {
        maxTokens,
        temperature,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        console.error(
          '[delegate] Cannot reach DMR at localhost:12434. Is Docker Model Runner running?',
        );
        process.exit(1);
      }
      throw err;
    }

    const output = DelegateResultSchema.parse({
      content: result.content,
      model,
      elapsed_ms: result.elapsed_ms,
    });

    console.log(JSON.stringify(output));
    console.error(
      `[delegate] model=${model} elapsed=${result.elapsed_ms}ms max_tokens=${maxTokens}`,
    );
  }

  private async resolveModel(
    cliModel: string | undefined,
  ): Promise<string | null> {
    if (cliModel) return cliModel;

    try {
      const { localMinions } = this.config.load();
      if (localMinions.model) return localMinions.model;
    } catch {
      // Config unavailable, fall through
    }

    try {
      const models = await this.dmr.fetchModels();
      if (models.data.length > 0) return models.data[0].id;
    } catch {
      // DMR unreachable
    }

    return null;
  }
}
