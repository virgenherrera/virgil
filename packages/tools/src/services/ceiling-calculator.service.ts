import { Injectable } from '@nestjs/common';
import type {
  HardwareProfile,
  CeilingCan,
  CeilingWant,
  EffectiveCeiling,
  Tier,
} from '../schemas/index.js';
import {
  CeilingCanSchema,
  EffectiveCeilingSchema,
  MODEL_CATALOG,
} from '../schemas/index.js';
import { FitnessScoringService } from './fitness-scoring.service.js';

@Injectable()
export class CeilingCalculatorService {
  constructor(private readonly fitnessScoring: FitnessScoringService) {}

  computeCan(hardware: HardwareProfile, ramReservationGb: number): CeilingCan {
    const effectiveRam = Math.min(
      hardware.ram.totalGb,
      hardware.docker.allocatedMemoryGb ?? hardware.ram.totalGb,
    );
    const ramBudget = effectiveRam - ramReservationGb;
    const qualifiedModels: Record<Tier, string[]> = {
      worker: [],
      reasoning: [],
      pro: [],
    };

    for (const model of MODEL_CATALOG) {
      const fitness = this.fitnessScoring.score(
        model,
        hardware,
        ramReservationGb,
      );
      if (fitness.fits) {
        qualifiedModels[model.tier].push(model.name);
      }
    }

    const fittingModels = MODEL_CATALOG.filter(
      (m) => m.ramRequiredGb <= ramBudget,
    );
    const smallestRam =
      fittingModels.length > 0
        ? Math.min(...fittingModels.map((m) => m.ramRequiredGb))
        : 0;
    const maxConcurrent =
      smallestRam > 0 ? Math.floor(ramBudget / smallestRam) : 0;

    const raw = {
      maxConcurrentModels: maxConcurrent,
      totalRamBudgetGb: parseFloat(ramBudget.toFixed(2)),
      availableDiskGb: hardware.disk.availableGb,
      qualifiedModels,
    };
    return CeilingCanSchema.parse(raw);
  }

  computeEffective(can: CeilingCan, want: CeilingWant): EffectiveCeiling {
    const explanation: Record<string, string> = {};

    const maxMinions = Math.min(can.maxConcurrentModels, want.maxMinions);
    if (want.maxMinions > can.maxConcurrentModels) {
      explanation['maxMinions'] =
        `Wanted ${want.maxMinions} but hardware supports at most ${can.maxConcurrentModels} concurrent models. Capped to ${maxMinions}.`;
    } else {
      explanation['maxMinions'] =
        `Wanted ${want.maxMinions}, hardware supports ${can.maxConcurrentModels}. Using ${maxMinions}.`;
    }

    const canTiers = (Object.entries(can.qualifiedModels) as [Tier, string[]][])
      .filter(([, models]) => models.length > 0)
      .map(([tier]) => tier);
    const allowedTiers = want.allowedTiers.filter((t) => canTiers.includes(t));
    const droppedTiers = want.allowedTiers.filter((t) => !canTiers.includes(t));
    if (droppedTiers.length > 0) {
      explanation['allowedTiers'] =
        `Tiers ${droppedTiers.join(', ')} have no qualified models on this hardware. Using: ${allowedTiers.join(', ') || 'none'}.`;
    } else {
      explanation['allowedTiers'] =
        `All requested tiers (${allowedTiers.join(', ')}) have qualified models.`;
    }

    const selectedModels: Record<string, string> = {};
    for (const [tier, modelName] of Object.entries(want.selectedModels)) {
      const qualifiedForTier = can.qualifiedModels[tier as Tier] ?? [];
      if (qualifiedForTier.includes(modelName)) {
        selectedModels[tier] = modelName;
        explanation[`model:${tier}`] =
          `Selected ${modelName} for ${tier} tier (qualified).`;
      } else if (qualifiedForTier.length > 0) {
        selectedModels[tier] = qualifiedForTier[0];
        explanation[`model:${tier}`] =
          `Wanted ${modelName} for ${tier} but it does not fit. Fell back to ${qualifiedForTier[0]}.`;
      } else {
        explanation[`model:${tier}`] =
          `No qualified models for ${tier} tier. Skipped.`;
      }
    }

    for (const tier of Object.keys(selectedModels)) {
      if (!allowedTiers.includes(tier as Tier)) {
        delete selectedModels[tier];
        explanation[`model:${tier}`] =
          `Tier ${tier} excluded — model removed from selection.`;
      }
    }

    const raw = { maxMinions, allowedTiers, selectedModels, explanation };
    return EffectiveCeilingSchema.parse(raw);
  }
}
