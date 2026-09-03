import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import {
  ConfigService,
  HardwareDetectionService,
} from '../src/services/index.js';

describe('ConfigService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: ConfigService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    service = moduleRef.get(ConfigService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  describe('getRepoRoot()', () => {
    it('returns a non-empty string', () => {
      const root = service.getRepoRoot();
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });
  });

  describe('hashProfile()', () => {
    it('produces a 16-character hex string', () => {
      const hardware = moduleRef.get(HardwareDetectionService);
      const profile = hardware.detect();
      const hash = service.hashProfile(profile);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('produces consistent hashes for the same profile', () => {
      const hardware = moduleRef.get(HardwareDetectionService);
      const profile = hardware.detect();
      const hash1 = service.hashProfile(profile);
      const hash2 = service.hashProfile(profile);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different profiles', () => {
      const profileA = {
        cpu: { arch: 'arm64', cores: 10, model: 'Apple M1 Pro' },
        gpu: { type: 'metal' as const, cores: 16, vram: null },
        ram: { totalGb: 32, availableGb: 20 },
        disk: { availableGb: 100 },
        docker: {
          engineVersion: '27.0.0',
          composeVersion: '2.30.0',
          dmrStatus: 'available' as const,
          allocatedCpu: 10,
          allocatedMemoryGb: 16,
        },
      };
      const profileB = {
        ...profileA,
        cpu: { arch: 'x64', cores: 8, model: 'Intel i9' },
      };
      expect(service.hashProfile(profileA)).not.toBe(
        service.hashProfile(profileB),
      );
    });
  });

  describe('load()', () => {
    it('reads virgil.json and returns config and localMinions', () => {
      const { config, localMinions } = service.load();
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(localMinions).toBeDefined();
      expect(localMinions.allowedTiers).toBeDefined();
      expect(Array.isArray(localMinions.allowedTiers)).toBe(true);
    });
  });
});
