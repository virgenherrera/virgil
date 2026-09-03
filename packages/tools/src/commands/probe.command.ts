import { Command, CommandRunner } from 'nest-commander';
import { DmrClientService } from '../services/index.js';

@Command({
  name: 'probe',
  description: 'List models from DMR at localhost:12434',
})
export class ProbeCommand extends CommandRunner {
  constructor(private readonly dmr: DmrClientService) {
    super();
  }

  async run(): Promise<void> {
    console.log('Probing DMR at http://localhost:12434/v1/models ...\n');

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

    if (!models.data || models.data.length === 0) {
      console.log('No models available in DMR.');
      console.log('Pull a model with: docker model pull <model-name>');
      return;
    }

    console.log(`Found ${models.data.length} model(s):\n`);

    for (const m of models.data) {
      console.log(`  ID:        ${m.id}`);
      console.log(`  Object:    ${m.object}`);
      if (m.created) {
        console.log(
          `  Created:   ${new Date(Number(m.created) * 1000).toISOString()}`,
        );
      }
      if (m.owned_by) {
        console.log(`  Owned by:  ${m.owned_by}`);
      }
      const knownKeys = new Set(['id', 'object', 'created', 'owned_by']);
      for (const [key, value] of Object.entries(m)) {
        if (!knownKeys.has(key) && value !== undefined) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
      console.log();
    }
  }
}
