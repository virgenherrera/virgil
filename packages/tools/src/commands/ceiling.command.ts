import { Command, CommandRunner, Option } from 'nest-commander';
import {
  HardwareDetectionService,
  CeilingCalculatorService,
  ConfigService,
  PromptService,
  FitnessScoringService,
} from '../services/index.js';
import type {
  Tier,
  CeilingWant,
  FitnessResult,
  ModelCatalogEntry,
} from '../schemas/index.js';
import {
  TierSchema,
  CeilingWantSchema,
  VirgilLocalMinionsConfigSchema,
  MODEL_CATALOG,
} from '../schemas/index.js';
import { DEFAULT_RAM_RESERVATION_GB } from '../probe.constants.js';

interface CeilingOptions {
  maxMinions?: number;
  tiers?: string;
  ramReservation?: number;
  save?: boolean;
}

@Command({ name: 'ceiling', description: 'CAN/WANT ceiling calculator' })
export class CeilingCommand extends CommandRunner {
  constructor(
    private readonly hardware: HardwareDetectionService,
    private readonly ceilingCalculator: CeilingCalculatorService,
    private readonly configService: ConfigService,
    private readonly promptService: PromptService,
    private readonly fitnessScoring: FitnessScoringService,
  ) {
    super();
  }

  @Option({
    flags: '--max-minions <n>',
    description: 'Desired max concurrent minions',
  })
  parseMaxMinions(val: string): number {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) {
      throw new Error('--max-minions must be a positive integer.');
    }
    return n;
  }

  @Option({
    flags: '--tiers <t>',
    description: 'Allowed tiers, comma-separated: worker,reasoning,pro',
  })
  parseTiers(val: string): string {
    const tiers = val.split(',').map((t) => t.trim());
    for (const t of tiers) {
      const result = TierSchema.safeParse(t);
      if (!result.success) {
        throw new Error(
          `Invalid tier "${t}". Must be one of: worker, reasoning, pro`,
        );
      }
    }
    return val;
  }

  @Option({
    flags: '--ram-reservation <gb>',
    description: `GB reserved for OS (default: ${DEFAULT_RAM_RESERVATION_GB})`,
  })
  parseRamReservation(val: string): number {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) {
      throw new Error('--ram-reservation must be a non-negative number.');
    }
    return n;
  }

  @Option({
    flags: '--save',
    description: 'Persist effective ceiling to virgil.json',
  })
  parseSave(): boolean {
    return true;
  }

  async run(_args: string[], options: CeilingOptions): Promise<void> {
    let maxMinions: number | undefined = options.maxMinions;
    let tiers: Tier[] | undefined = options.tiers
      ? (options.tiers.split(',').map((t) => t.trim()) as Tier[])
      : undefined;
    const ramReservation = options.ramReservation ?? DEFAULT_RAM_RESERVATION_GB;
    const save = options.save ?? false;

    // Detect hardware
    const hw = this.hardware.detect();
    const can = this.ceilingCalculator.computeCan(hw, ramReservation);

    console.error('=== CAN Ceiling (what hardware supports) ===');
    console.error(`  Max concurrent models: ${can.maxConcurrentModels}`);
    console.error(
      `  Total RAM budget:      ${can.totalRamBudgetGb.toFixed(1)} GB`,
    );
    console.error(
      `  Available disk:        ${can.availableDiskGb.toFixed(1)} GB`,
    );
    for (const tier of ['worker', 'reasoning', 'pro'] as Tier[]) {
      const models = can.qualifiedModels[tier] ?? [];
      console.error(
        `  ${tier.padEnd(10)} models:  ${models.length > 0 ? models.join(', ') : '(none)'}`,
      );
    }
    console.error();

    // If interactive mode (no WANT args), prompt the user
    if (maxMinions === undefined) {
      const answer = await this.promptService.ask(
        `How many concurrent minions do you want? (max ${can.maxConcurrentModels}): `,
      );
      maxMinions = parseInt(answer, 10);
      if (isNaN(maxMinions) || maxMinions < 1) {
        console.error('Invalid input. Using 1.');
        maxMinions = 1;
      }
    }

    if (tiers === undefined) {
      const availTiers = (['worker', 'reasoning', 'pro'] as Tier[]).filter(
        (t: Tier) => (can.qualifiedModels[t] ?? []).length > 0,
      );
      const answer = await this.promptService.ask(
        `Allowed tiers (comma-separated, available: ${availTiers.join(',')}): `,
      );
      tiers = answer
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean) as Tier[];
      if (tiers.length === 0) {
        tiers = availTiers.length > 0 ? [availTiers[0]] : ['worker'];
      }
    }

    // Auto-select best model per tier (highest score)
    const selectedModels: Record<string, string> = {};
    for (const tier of tiers) {
      const qualified = can.qualifiedModels[tier] ?? [];
      if (qualified.length > 0) {
        // Pick the model with the highest fitness score
        const fitnessScores = qualified.map((name: string) => {
          const entry = MODEL_CATALOG.find(
            (m: ModelCatalogEntry) => m.name === name,
          )!;
          return this.fitnessScoring.score(entry, hw, ramReservation);
        });
        fitnessScores.sort(
          (a: FitnessResult, b: FitnessResult) => b.score - a.score,
        );
        selectedModels[tier] = fitnessScores[0].model;
      }
    }

    const want: CeilingWant = CeilingWantSchema.parse({
      maxMinions,
      allowedTiers: tiers,
      selectedModels,
      ramReservationGb: ramReservation,
    });

    const effective = this.ceilingCalculator.computeEffective(can, want);

    if (effective.allowedTiers.length === 0) {
      console.error(
        '\nNo tiers qualify on this hardware. Cannot save ceiling.',
      );
      console.error(
        'Consider: increasing Docker memory, reducing RAM reservation, or using smaller models.',
      );
      if (save) process.exit(1);
    }

    console.error('=== WANT Ceiling (what you requested) ===');
    console.error(`  Max minions:    ${want.maxMinions}`);
    console.error(`  Allowed tiers:  ${want.allowedTiers.join(', ')}`);
    console.error(`  RAM reservation: ${want.ramReservationGb} GB`);
    console.error();

    console.error('=== Effective Ceiling (min of CAN, WANT) ===');
    console.error(`  Max minions:    ${effective.maxMinions}`);
    console.error(`  Allowed tiers:  ${effective.allowedTiers.join(', ')}`);
    for (const [tier, model] of Object.entries(effective.selectedModels)) {
      console.error(`  ${tier} model:  ${model}`);
    }
    console.error();
    for (const [dim, reason] of Object.entries(effective.explanation)) {
      console.error(`  [${dim}] ${reason}`);
    }

    // JSON output to stdout
    console.log(JSON.stringify(effective, null, 2));

    if (save) {
      // Determine highest allowed tier for the ceiling field
      const tierRank: Record<string, number> = {
        worker: 1,
        reasoning: 2,
        pro: 3,
      };
      const highestTier = effective.allowedTiers.reduce(
        (max: Tier, t: Tier) =>
          (tierRank[t] ?? 0) > (tierRank[max] ?? 0) ? t : max,
        effective.allowedTiers[0] ?? 'worker',
      );

      // Pick model from the highest available tier
      const selectedModel = effective.selectedModels[highestTier] ?? null;

      const localMinions = VirgilLocalMinionsConfigSchema.parse({
        ceiling: highestTier,
        allowedTiers: effective.allowedTiers,
        model: selectedModel,
        effectiveCeiling: effective,
        hardwareProfileHash: this.configService.hashProfile(hw),
        lastProbeDate: new Date().toISOString(),
      });

      this.configService.save(localMinions);
      console.error(`\nSaved to ${this.configService.getConfigPath()}`);
    }
  }
}
