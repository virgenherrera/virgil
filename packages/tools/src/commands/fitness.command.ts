import { Command, CommandRunner } from 'nest-commander';
import {
  HardwareDetectionService,
  FitnessScoringService,
} from '../services/index.js';
import type { Tier, FitnessResult } from '../schemas/index.js';
import { DEFAULT_RAM_RESERVATION_GB } from '../probe.constants.js';

@Command({
  name: 'fitness',
  description: 'Score all catalog models against hardware',
})
export class FitnessCommand extends CommandRunner {
  constructor(
    private readonly hardware: HardwareDetectionService,
    private readonly fitnessScoring: FitnessScoringService,
  ) {
    super();
  }

  async run(_passedParams: string[]): Promise<void> {
    const hw = this.hardware.detect();
    const results = this.fitnessScoring.scoreAll(
      hw,
      DEFAULT_RAM_RESERVATION_GB,
    );

    console.error(
      `Hardware: ${hw.cpu.model} | ${hw.ram.totalGb} GB RAM | GPU: ${hw.gpu.type}`,
    );
    console.error(
      `RAM budget: ${(hw.ram.totalGb - DEFAULT_RAM_RESERVATION_GB).toFixed(1)} GB (after ${DEFAULT_RAM_RESERVATION_GB} GB OS reservation)\n`,
    );

    // Group by tier for display
    for (const tier of ['worker', 'reasoning', 'pro'] as Tier[]) {
      const tierResults = results.filter((r: FitnessResult) => r.tier === tier);
      console.error(`--- ${tier.toUpperCase()} tier ---`);
      for (const r of tierResults) {
        const status = r.fits ? 'FITS' : 'NO';
        const bar = '='.repeat(Math.round(r.score * 20));
        console.error(
          `  ${status.padEnd(4)} ${r.model.padEnd(22)} RAM: ${r.ramNeededGb.toFixed(1)} GB  Score: ${r.score.toFixed(3)} ${bar}`,
        );
      }
      console.error();
    }

    // JSON output to stdout
    console.log(JSON.stringify(results, null, 2));
  }
}
