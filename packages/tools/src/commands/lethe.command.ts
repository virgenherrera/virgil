import { Command, CommandRunner, Option } from 'nest-commander';
import { LetheConfigService } from '../services/lethe-config.service.js';
import { ReadFileService } from '../services/read-file.service.js';
import { ReadJsonService } from '../services/read-json.service.js';
import { CrawlDirsService } from '../services/crawl-dirs.service.js';
import {
  LetheTaskTypeSchema,
  LetheResultSchema,
  type LetheTaskType,
} from '../schemas/index.js';
import { readFileSync } from 'node:fs';

interface RawLetheOptions {
  task?: string;
  input?: string;
}

@Command({
  name: 'lethe',
  description: 'Pre-tokenization filter: compress raw context into lean text',
})
export class LetheCommand extends CommandRunner {
  constructor(
    private readonly letheConfig: LetheConfigService,
    private readonly readFile: ReadFileService,
    private readonly readJson: ReadJsonService,
    private readonly crawlDirs: CrawlDirsService,
  ) {
    super();
  }

  @Option({
    flags: '--task <type>',
    description:
      'Task type: readFile, readJson, crawlDirs, rawInput, phaseOutput',
    required: true,
  })
  parseTask(val: string): string {
    return LetheTaskTypeSchema.parse(val);
  }

  @Option({
    flags: '--input <path>',
    description: 'Input file or directory path',
    required: true,
  })
  parseInput(val: string): string {
    return val;
  }

  async run(_args: string[], options: RawLetheOptions): Promise<void> {
    const task = options.task as LetheTaskType;
    const input = options.input!;

    if (task === 'rawInput' || task === 'phaseOutput') {
      console.error(
        `[lethe] Task "${task}" requires LLM processing. Use pnpm delegate for LLM tasks.`,
      );
      process.exit(1);
    }

    const config = this.letheConfig.load();
    if (!config.enabled || !config.tasks[task]) {
      const reason = !config.enabled
        ? 'lethe.enabled is false'
        : `lethe.tasks.${task} is disabled`;
      console.error(`[lethe] ${reason} — outputting raw content.`);
      const rawContent = readFileSync(input, 'utf8');
      const result = LetheResultSchema.parse({
        task,
        input,
        output: rawContent,
        elapsed_ms: 0,
      });
      console.log(JSON.stringify(result));
      return;
    }

    const start = performance.now();
    let output: string;

    switch (task) {
      case 'readFile':
        output = this.readFile.extract(input);
        break;
      case 'readJson':
        output = await this.readJson.infer(readFileSync(input, 'utf8'));
        break;
      case 'crawlDirs':
        output = this.crawlDirs.manifest(input);
        break;
      default:
        console.error(`[lethe] Unknown task: ${task}`);
        process.exit(1);
    }

    const elapsed_ms = Math.round(performance.now() - start);
    const result = LetheResultSchema.parse({ task, input, output, elapsed_ms });
    console.log(JSON.stringify(result));
    console.error(`[lethe] task=${task} elapsed=${elapsed_ms}ms`);
  }
}
