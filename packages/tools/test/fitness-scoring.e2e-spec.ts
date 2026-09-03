import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { FitnessScoringService } from '../src/services/index.js';
import type {
  HardwareProfile,
  ModelCatalogEntry,
} from '../src/schemas/index.js';
import { FitnessResultSchema, MODEL_CATALOG } from '../src/schemas/index.js';

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

const SAMPLE_MODEL: ModelCatalogEntry = MODEL_CATALOG.find(
  (m) => m.tier === 'worker',
)!;

describe('FitnessScoringService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: FitnessScoringService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    service = moduleRef.get(FitnessScoringService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  describe('score()', () => {
    it('returns a valid FitnessResult for a model that fits', () => {
      const profile = makeProfile();
      const result = service.score(SAMPLE_MODEL, profile, 4);
      expect(() => FitnessResultSchema.parse(result)).not.toThrow();
      expect(result.fits).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('returns fits=false when RAM is insufficient', () => {
      const profile = makeProfile({ ram: { totalGb: 2, availableGb: 1 } });
      const result = service.score(SAMPLE_MODEL, profile, 0);
      expect(result.fits).toBe(false);
      expect(result.score).toBe(0);
    });

    it('returns fits=false when disk is insufficient', () => {
      const profile = makeProfile({ disk: { availableGb: 0.5 } });
      const result = service.score(SAMPLE_MODEL, profile, 0);
      expect(result.fits).toBe(false);
      expect(result.score).toBe(0);
    });

    it('handles zero RAM available after reservation', () => {
      const profile = makeProfile({ ram: { totalGb: 4, availableGb: 0 } });
      const result = service.score(SAMPLE_MODEL, profile, 4);
      expect(result.fits).toBe(false);
      expect(result.score).toBe(0);
    });

    it('reports the correct tier from the model entry', () => {
      const profile = makeProfile();
      const result = service.score(SAMPLE_MODEL, profile, 0);
      expect(result.tier).toBe(SAMPLE_MODEL.tier);
    });
  });

  describe('scoreAll()', () => {
    it('returns a result for every catalog entry', () => {
      const profile = makeProfile();
      const results = service.scoreAll(profile, 4);
      expect(results).toHaveLength(MODEL_CATALOG.length);
    });

    it('every result passes FitnessResultSchema validation', () => {
      const profile = makeProfile();
      const results = service.scoreAll(profile, 4);
      for (const result of results) {
        expect(() => FitnessResultSchema.parse(result)).not.toThrow();
      }
    });

    it('marks large models as not fitting on constrained hardware', () => {
      const profile = makeProfile({ ram: { totalGb: 8, availableGb: 4 } });
      const results = service.scoreAll(profile, 2);
      const proResults = results.filter((r) => r.tier === 'pro');
      for (const result of proResults) {
        expect(result.fits).toBe(false);
      }
    });
  });
});
