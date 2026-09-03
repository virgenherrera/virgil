import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { CeilingCalculatorService } from '../src/services/index.js';
import type {
  HardwareProfile,
  CeilingCan,
  CeilingWant,
} from '../src/schemas/index.js';
import {
  CeilingCanSchema,
  EffectiveCeilingSchema,
} from '../src/schemas/index.js';

function makeProfile(
  overrides: Partial<HardwareProfile> = {},
): HardwareProfile {
  return {
    cpu: { arch: 'arm64', cores: 10, model: 'Apple M1 Pro' },
    gpu: { type: 'metal', cores: 16, vram: null },
    ram: { totalGb: 32, availableGb: 20 },
    disk: { availableGb: 200 },
    docker: {
      engineVersion: '27.0.0',
      composeVersion: '2.30.0',
      dmrStatus: 'available',
      allocatedCpu: 10,
      allocatedMemoryGb: 16,
    },
    ...overrides,
  };
}

describe('CeilingCalculatorService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: CeilingCalculatorService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    service = moduleRef.get(CeilingCalculatorService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  describe('computeCan()', () => {
    it('returns a valid CeilingCan that passes schema validation', () => {
      const profile = makeProfile();
      const can = service.computeCan(profile, 4);
      expect(() => CeilingCanSchema.parse(can)).not.toThrow();
    });

    it('qualifies worker models on 32GB hardware', () => {
      const profile = makeProfile();
      const can = service.computeCan(profile, 4);
      expect(can.qualifiedModels.worker.length).toBeGreaterThan(0);
    });

    it('returns zero maxConcurrentModels when no models fit', () => {
      const profile = makeProfile({ ram: { totalGb: 1, availableGb: 0.5 } });
      const can = service.computeCan(profile, 0);
      expect(can.maxConcurrentModels).toBe(0);
      expect(can.qualifiedModels.worker).toHaveLength(0);
      expect(can.qualifiedModels.reasoning).toHaveLength(0);
      expect(can.qualifiedModels.pro).toHaveLength(0);
    });

    it('respects docker allocatedMemoryGb as upper bound on effective RAM', () => {
      const profile = makeProfile({
        ram: { totalGb: 64, availableGb: 50 },
        docker: {
          engineVersion: '27.0.0',
          composeVersion: '2.30.0',
          dmrStatus: 'available',
          allocatedCpu: 8,
          allocatedMemoryGb: 8,
        },
      });
      const can = service.computeCan(profile, 0);
      expect(can.totalRamBudgetGb).toBeLessThanOrEqual(8);
    });

    it('uses total RAM when docker allocatedMemoryGb is null', () => {
      const profile = makeProfile({
        ram: { totalGb: 32, availableGb: 20 },
        docker: {
          engineVersion: '27.0.0',
          composeVersion: '2.30.0',
          dmrStatus: 'available',
          allocatedCpu: 10,
          allocatedMemoryGb: null,
        },
      });
      const can = service.computeCan(profile, 4);
      expect(can.totalRamBudgetGb).toBe(28);
    });
  });

  describe('computeEffective()', () => {
    it('returns a valid EffectiveCeiling that passes schema validation', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 3,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: {
          worker: ['llama3.1:8b', 'mistral:7b'],
          reasoning: ['phi4:14b'],
          pro: [],
        },
      };
      const want: CeilingWant = {
        maxMinions: 2,
        allowedTiers: ['worker', 'reasoning'],
        selectedModels: { worker: 'llama3.1:8b', reasoning: 'phi4:14b' },
        ramReservationGb: 4,
      };
      const effective = service.computeEffective(can, want);
      expect(() => EffectiveCeilingSchema.parse(effective)).not.toThrow();
    });

    it('caps maxMinions to the min of CAN and WANT', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 2,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: { worker: ['llama3.1:8b'], reasoning: [], pro: [] },
      };
      const want: CeilingWant = {
        maxMinions: 5,
        allowedTiers: ['worker'],
        selectedModels: { worker: 'llama3.1:8b' },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.maxMinions).toBe(2);
      expect(effective.explanation['maxMinions']).toContain('Capped');
    });

    it('explains when want <= can maxMinions', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 5,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: { worker: ['llama3.1:8b'], reasoning: [], pro: [] },
      };
      const want: CeilingWant = {
        maxMinions: 2,
        allowedTiers: ['worker'],
        selectedModels: { worker: 'llama3.1:8b' },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.maxMinions).toBe(2);
      expect(effective.explanation['maxMinions']).toContain('Using 2');
    });

    it('drops tiers that have no qualified models', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 2,
        totalRamBudgetGb: 10,
        availableDiskGb: 100,
        qualifiedModels: { worker: ['llama3.1:8b'], reasoning: [], pro: [] },
      };
      const want: CeilingWant = {
        maxMinions: 2,
        allowedTiers: ['worker', 'reasoning', 'pro'],
        selectedModels: { worker: 'llama3.1:8b' },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.allowedTiers).toContain('worker');
      expect(effective.allowedTiers).not.toContain('reasoning');
      expect(effective.allowedTiers).not.toContain('pro');
      expect(effective.explanation['allowedTiers']).toContain(
        'no qualified models',
      );
    });

    it('explains when all requested tiers are available', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 3,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: {
          worker: ['llama3.1:8b'],
          reasoning: ['phi4:14b'],
          pro: [],
        },
      };
      const want: CeilingWant = {
        maxMinions: 2,
        allowedTiers: ['worker', 'reasoning'],
        selectedModels: {
          worker: 'llama3.1:8b',
          reasoning: 'phi4:14b',
        },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.explanation['allowedTiers']).toContain(
        'All requested tiers',
      );
    });

    it('handles empty allowedTiers result when no tiers qualify', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 0,
        totalRamBudgetGb: 0,
        availableDiskGb: 0,
        qualifiedModels: { worker: [], reasoning: [], pro: [] },
      };
      const want: CeilingWant = {
        maxMinions: 1,
        allowedTiers: ['worker'],
        selectedModels: {},
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.allowedTiers).toHaveLength(0);
      expect(effective.maxMinions).toBe(0);
    });

    it('falls back to first qualified model when selected model does not fit', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 2,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: { worker: ['mistral:7b'], reasoning: [], pro: [] },
      };
      const want: CeilingWant = {
        maxMinions: 2,
        allowedTiers: ['worker'],
        selectedModels: { worker: 'llama3.1:8b' },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.selectedModels['worker']).toBe('mistral:7b');
      expect(effective.explanation['model:worker']).toContain('Fell back');
    });

    it('explains when no qualified models exist for a selected tier', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 2,
        totalRamBudgetGb: 10,
        availableDiskGb: 100,
        qualifiedModels: {
          worker: ['llama3.1:8b'],
          reasoning: [],
          pro: [],
        },
      };
      const want: CeilingWant = {
        maxMinions: 1,
        allowedTiers: ['worker', 'reasoning'],
        selectedModels: {
          worker: 'llama3.1:8b',
          reasoning: 'phi4:14b',
        },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);
      expect(effective.explanation['model:reasoning']).toContain(
        'No qualified models',
      );
      expect(effective.explanation['model:reasoning']).toContain('Skipped');
      expect(effective.selectedModels).not.toHaveProperty('reasoning');
    });

    it('removes selected models when their tier is excluded from allowedTiers', () => {
      const can: CeilingCan = {
        maxConcurrentModels: 2,
        totalRamBudgetGb: 28,
        availableDiskGb: 200,
        qualifiedModels: {
          worker: ['llama3.1:8b'],
          reasoning: ['phi4:14b'],
          pro: [],
        },
      };
      const want: CeilingWant = {
        maxMinions: 1,
        allowedTiers: ['worker'],
        selectedModels: {
          worker: 'llama3.1:8b',
          reasoning: 'phi4:14b',
        },
        ramReservationGb: 0,
      };
      const effective = service.computeEffective(can, want);

      // reasoning is qualified in can but not in want.allowedTiers
      // → first loop adds it, second loop removes it
      expect(effective.selectedModels).not.toHaveProperty('reasoning');
      expect(effective.explanation['model:reasoning']).toContain('excluded');
    });
  });
});
