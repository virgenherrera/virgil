import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeStatsOutputSchema } from './knowledge.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'stats',
  description: 'Show knowledge base statistics.',
})
export class KnowledgeStatsCommand extends CommandRunner {
  constructor(private readonly knowledgeService: KnowledgeService) {
    super();
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const result = this.knowledgeService.stats();
    const output = KnowledgeStatsOutputSchema.parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
