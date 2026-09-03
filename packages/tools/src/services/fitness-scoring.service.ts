import { Injectable } from '@nestjs/common';
import type {
  ModelCatalogEntry,
  HardwareProfile,
  FitnessResult,
} from '../schemas/index.js';
import { FitnessResultSchema, MODEL_CATALOG } from '../schemas/index.js';

@Injectable()
export class FitnessScoringService {
  score(
    model: ModelCatalogEntry,
    hardware: HardwareProfile,
    ramReservationGb: number,
  ): FitnessResult {
    const ramBudget = hardware.ram.totalGb - ramReservationGb;
    const fits =
      model.ramRequiredGb <= ramBudget &&
      model.diskRequiredGb <= hardware.disk.availableGb;

    const ramScore = fits
      ? Math.min(1, (ramBudget - model.ramRequiredGb) / ramBudget)
      : 0;
    const diskScore = fits
      ? Math.min(
          1,
          (hardware.disk.availableGb - model.diskRequiredGb) /
            hardware.disk.availableGb,
        )
      : 0;
    const score = parseFloat((ramScore * 0.7 + diskScore * 0.3).toFixed(3));

    const result = {
      model: model.name,
      fits,
      score,
      ramNeededGb: model.ramRequiredGb,
      diskNeededGb: model.diskRequiredGb,
      ramAvailableGb: parseFloat(ramBudget.toFixed(2)),
      tier: model.tier,
    };
    return FitnessResultSchema.parse(result);
  }

  scoreAll(
    hardware: HardwareProfile,
    ramReservationGb: number,
  ): FitnessResult[] {
    return MODEL_CATALOG.map((model) =>
      this.score(model, hardware, ramReservationGb),
    );
  }
}
