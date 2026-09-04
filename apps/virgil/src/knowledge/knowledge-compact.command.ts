import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { KnowledgeService } from './knowledge.service.js';
import { PromptService } from '../shared/prompt.service.js';
import { KnowledgeCompactOutputSchema } from './knowledge.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'compact',
  description: 'Compact the knowledge base by merging and pruning entries.',
})
export class KnowledgeCompactCommand extends CommandRunner {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (!options?.yes) {
      const confirmed = await this.promptService.confirm(
        'Run knowledge compaction?',
        { default: false },
      );
      if (!confirmed) {
        console.log('Compaction cancelled.');
        return;
      }
    }

    const result = this.knowledgeService.compact();
    const output = KnowledgeCompactOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--yes', description: 'Skip confirmation' })
  parseYes(): boolean {
    return true;
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
