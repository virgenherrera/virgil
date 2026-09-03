import { Command, CommandRunner } from 'nest-commander';
import {
  DmrClientService,
  ConfigService,
  HardwareDetectionService,
  FitnessScoringService,
} from '../services/index.js';
import type { ModelCatalogEntry } from '../schemas/index.js';
import { MODEL_CATALOG } from '../schemas/index.js';
import { DEFAULT_RAM_RESERVATION_GB } from '../probe.constants.js';

@Command({
  name: 'select',
  description: 'Write selected model to virgil.json',
  arguments: '<model>',
})
export class SelectCommand extends CommandRunner {
  constructor(
    private readonly dmr: DmrClientService,
    private readonly configService: ConfigService,
    private readonly hardware: HardwareDetectionService,
    private readonly fitnessScoring: FitnessScoringService,
  ) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const modelName = passedParams[0];
    if (!modelName) {
      console.error('Usage: pnpm probe select <model-name>');
      process.exit(1);
    }

    // Check fitness against ceiling before allowing selection
    const hw = this.hardware.detect();
    const catalogEntry = MODEL_CATALOG.find(
      (m: ModelCatalogEntry) => m.name === modelName,
    );

    if (catalogEntry) {
      const fitness = this.fitnessScoring.score(
        catalogEntry,
        hw,
        DEFAULT_RAM_RESERVATION_GB,
      );
      if (!fitness.fits) {
        console.error(
          `ERROR: Model "${modelName}" does not fit on this hardware.`,
        );
        console.error(`  RAM needed:    ${fitness.ramNeededGb.toFixed(1)} GB`);
        console.error(
          `  RAM available: ${fitness.ramAvailableGb.toFixed(1)} GB`,
        );
        console.error(`  Disk needed:   ${fitness.diskNeededGb.toFixed(1)} GB`);
        console.error(`  Disk available: ${hw.disk.availableGb.toFixed(1)} GB`);
        console.error("\nRun 'pnpm probe fitness' to see which models fit.");
        process.exit(1);
      }
    }

    // Verify model exists in DMR
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

    const { localMinions } = this.configService.load();
    localMinions.model = modelName;
    this.configService.save(localMinions);

    console.log(`Model selected: "${modelName}"`);
    console.log(`Updated virgil.json at ${this.configService.getConfigPath()}`);
  }
}
