import { Option, SubCommand, CommandRunner } from 'nest-commander';
import { z } from 'zod';
import { KnowledgeService } from './knowledge.service.js';
import { PromptService } from '../shared/prompt.service.js';
import {
  KnowledgeSearchInputSchema,
  KnowledgeSearchOutputSchema,
} from './knowledge.schemas.js';
import { formatOutput } from '../shared/output.formatter.js';
import { JsonOptionSchema } from '../shared/schemas.js';

@SubCommand({
  name: 'search',
  description: 'Search the knowledge base.',
  arguments: '[query]',
})
export class KnowledgeSearchCommand extends CommandRunner {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly promptService: PromptService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    let query = passedParams[0];
    if (!query) {
      query = await this.promptService.input('Search query');
    }

    const input = KnowledgeSearchInputSchema.parse({ query });
    const result = this.knowledgeService.search(input);
    const output = z.array(KnowledgeSearchOutputSchema).parse(result);
    const opts = JsonOptionSchema.parse(options ?? {});

    console.log(formatOutput(output, opts.json));
  }

  @Option({ flags: '--json', description: 'Output as JSON' })
  parseJson(): boolean {
    return true;
  }
}
