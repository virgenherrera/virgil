import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import {
  HardwareDetectionService,
  FitnessScoringService,
  CeilingCalculatorService,
  ConfigService,
} from '../src/services/index.js';
import type { HardwareProfile } from '../src/schemas/index.js';
import { MODEL_CATALOG, computeRamRequired } from '../src/schemas/index.js';

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

describe('Schemas (e2e) — validated through DI container', () => {
  let moduleRef: TestingModule;
  let hardwareService: HardwareDetectionService;
  let fitnessService: FitnessScoringService;
  let ceilingService: CeilingCalculatorService;
  let configService: ConfigService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    hardwareService = moduleRef.get(HardwareDetectionService);
    fitnessService = moduleRef.get(FitnessScoringService);
    ceilingService = moduleRef.get(CeilingCalculatorService);
    configService = moduleRef.get(ConfigService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('HardwareProfileSchema (via HardwareDetectionService.detect)', () => {
    it('detect() returns an object with the expected cpu shape', () => {
      const profile = hardwareService.detect();
      expect(profile).toHaveProperty('cpu');
      expect(profile.cpu).toHaveProperty('arch');
      expect(profile.cpu).toHaveProperty('cores');
      expect(profile.cpu).toHaveProperty('model');
      expect(typeof profile.cpu.arch).toBe('string');
      expect(profile.cpu.cores).toBeGreaterThan(0);
    });

    it('detect() returns an object with the expected gpu shape', () => {
      const profile = hardwareService.detect();
      expect(profile).toHaveProperty('gpu');
      expect(profile.gpu).toHaveProperty('type');
      expect(['metal', 'cuda', 'none']).toContain(profile.gpu.type);
    });

    it('detect() returns an object with the expected ram shape', () => {
      const profile = hardwareService.detect();
      expect(profile).toHaveProperty('ram');
      expect(profile.ram).toHaveProperty('totalGb');
      expect(profile.ram).toHaveProperty('availableGb');
      expect(profile.ram.totalGb).toBeGreaterThan(0);
      expect(profile.ram.availableGb).toBeGreaterThanOrEqual(0);
    });

    it('detect() returns an object with the expected disk shape', () => {
      const profile = hardwareService.detect();
      expect(profile).toHaveProperty('disk');
      expect(profile.disk).toHaveProperty('availableGb');
      expect(profile.disk.availableGb).toBeGreaterThanOrEqual(0);
    });

    it('detect() returns an object with the expected docker shape', () => {
      const profile = hardwareService.detect();
      expect(profile).toHaveProperty('docker');
      expect(profile.docker).toHaveProperty('dmrStatus');
      expect(['available', 'unavailable', 'unknown']).toContain(
        profile.docker.dmrStatus,
      );
    });
  });

  describe('ModelCatalogEntrySchema + FitnessResultSchema (via FitnessScoringService.score)', () => {
    it('score() returns an object with the expected fitness result shape', () => {
      const profile = makeProfile();
      const model = MODEL_CATALOG.find((m) => m.tier === 'worker')!;
      const result = fitnessService.score(model, profile, 4);
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('fits');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('ramNeededGb');
      expect(result).toHaveProperty('diskNeededGb');
      expect(result).toHaveProperty('ramAvailableGb');
      expect(result).toHaveProperty('tier');
      expect(typeof result.model).toBe('string');
      expect(typeof result.fits).toBe('boolean');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('score() returns fits=false when RAM is insufficient', () => {
      const profile = makeProfile({ ram: { totalGb: 2, availableGb: 1 } });
      const model = MODEL_CATALOG.find((m) => m.tier === 'worker')!;
      const result = fitnessService.score(model, profile, 0);
      expect(result.fits).toBe(false);
      expect(result.score).toBe(0);
    });

    it('score() reports the correct tier from the catalog entry', () => {
      const profile = makeProfile();
      const model = MODEL_CATALOG.find((m) => m.tier === 'reasoning')!;
      const result = fitnessService.score(model, profile, 4);
      expect(result.tier).toBe('reasoning');
    });
  });

  describe('MODEL_CATALOG validation (via FitnessScoringService.scoreAll)', () => {
    it('scoreAll() returns a result for every catalog entry', () => {
      const profile = makeProfile();
      const results = fitnessService.scoreAll(profile, 4);
      expect(results).toHaveLength(MODEL_CATALOG.length);
    });

    it('catalog entries cover all three tiers', () => {
      const profile = makeProfile();
      const results = fitnessService.scoreAll(profile, 4);
      const tiers = new Set(results.map((r) => r.tier));
      expect(tiers.has('worker')).toBe(true);
      expect(tiers.has('reasoning')).toBe(true);
      expect(tiers.has('pro')).toBe(true);
    });

    it('every result has expected numeric fields', () => {
      const profile = makeProfile();
      const results = fitnessService.scoreAll(profile, 4);
      for (const result of results) {
        expect(typeof result.score).toBe('number');
        expect(typeof result.ramNeededGb).toBe('number');
        expect(typeof result.diskNeededGb).toBe('number');
        expect(typeof result.ramAvailableGb).toBe('number');
      }
    });
  });

  describe('CeilingCanSchema (via CeilingCalculatorService.computeCan)', () => {
    it('computeCan() returns an object with the expected shape', () => {
      const profile = makeProfile();
      const can = ceilingService.computeCan(profile, 4);
      expect(can).toHaveProperty('maxConcurrentModels');
      expect(can).toHaveProperty('totalRamBudgetGb');
      expect(can).toHaveProperty('availableDiskGb');
      expect(can).toHaveProperty('qualifiedModels');
      expect(typeof can.maxConcurrentModels).toBe('number');
      expect(typeof can.totalRamBudgetGb).toBe('number');
      expect(typeof can.availableDiskGb).toBe('number');
    });

    it('computeCan() qualifiedModels has all three tier keys', () => {
      const profile = makeProfile();
      const can = ceilingService.computeCan(profile, 4);
      expect(can.qualifiedModels).toHaveProperty('worker');
      expect(can.qualifiedModels).toHaveProperty('reasoning');
      expect(can.qualifiedModels).toHaveProperty('pro');
      expect(Array.isArray(can.qualifiedModels.worker)).toBe(true);
      expect(Array.isArray(can.qualifiedModels.reasoning)).toBe(true);
      expect(Array.isArray(can.qualifiedModels.pro)).toBe(true);
    });
  });

  describe('EffectiveCeilingSchema + CeilingWantSchema (via CeilingCalculatorService.computeEffective)', () => {
    it('computeEffective() returns an object with the expected shape', () => {
      const profile = makeProfile();
      const can = ceilingService.computeCan(profile, 4);
      const want = {
        maxMinions: 1,
        allowedTiers: ['worker' as const],
        selectedModels: {
          worker: can.qualifiedModels.worker[0] ?? 'llama3.1:8b',
        },
        ramReservationGb: 4,
      };
      const effective = ceilingService.computeEffective(can, want);
      expect(effective).toHaveProperty('maxMinions');
      expect(effective).toHaveProperty('allowedTiers');
      expect(effective).toHaveProperty('selectedModels');
      expect(effective).toHaveProperty('explanation');
      expect(typeof effective.maxMinions).toBe('number');
      expect(Array.isArray(effective.allowedTiers)).toBe(true);
      expect(typeof effective.selectedModels).toBe('object');
      expect(typeof effective.explanation).toBe('object');
    });

    it('computeEffective() caps maxMinions to hardware capacity', () => {
      const profile = makeProfile();
      const can = ceilingService.computeCan(profile, 4);
      const want = {
        maxMinions: 999,
        allowedTiers: ['worker' as const],
        selectedModels: {
          worker: can.qualifiedModels.worker[0] ?? 'llama3.1:8b',
        },
        ramReservationGb: 4,
      };
      const effective = ceilingService.computeEffective(can, want);
      expect(effective.maxMinions).toBeLessThanOrEqual(can.maxConcurrentModels);
    });
  });

  describe('VirgilLocalMinionsConfigSchema (via ConfigService.load)', () => {
    it('load() returns an object with the expected localMinions shape', () => {
      const { config, localMinions } = configService.load();
      expect(config).toHaveProperty('localMinions');
      expect(localMinions).toHaveProperty('ceiling');
      expect(localMinions).toHaveProperty('allowedTiers');
      expect(Array.isArray(localMinions.allowedTiers)).toBe(true);
    });
  });

  describe('computeRamRequired (pure function, no schema.parse)', () => {
    it('applies the formula parametersBillions * 0.55 + 1.5', () => {
      expect(computeRamRequired(8)).toBe(
        parseFloat((8 * 0.55 + 1.5).toFixed(2)),
      );
      expect(computeRamRequired(70)).toBe(
        parseFloat((70 * 0.55 + 1.5).toFixed(2)),
      );
    });

    it('returns positive values for positive input', () => {
      expect(computeRamRequired(1)).toBeGreaterThan(0);
    });

    it('ramRequiredGb matches computeRamRequired for every catalog entry', () => {
      for (const entry of MODEL_CATALOG) {
        expect(entry.ramRequiredGb).toBe(
          computeRamRequired(entry.parametersBillions),
        );
      }
    });
  });
});
