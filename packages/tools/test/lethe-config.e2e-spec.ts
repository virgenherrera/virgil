import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { LetheConfigService, ConfigService } from '../src/services/index.js';
import type { VirgilLocalMinionsConfig } from '../src/schemas/index.js';

// Mock fs and child_process since ConfigService uses them
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('/fake/root\n'),
}));

const { mockReadFileSync, mockExistsSync, mockWriteFileSync } = vi.hoisted(
  () => ({
    mockReadFileSync: vi.fn(),
    mockExistsSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
  }),
);

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
  };
});

const dummyLocalMinions: VirgilLocalMinionsConfig = {
  ceiling: 'worker',
  allowedTiers: ['worker'],
  model: null,
  effectiveCeiling: null,
  hardwareProfileHash: null,
  lastProbeDate: null,
};

const defaultLetheConfig = {
  enabled: false,
  tasks: {
    readFile: true,
    readJson: true,
    crawlDirs: true,
    rawInput: true,
    phaseOutput: true,
  },
};

describe('LetheConfigService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: LetheConfigService;

  const mockConfigService = {
    load: vi.fn<
      () => {
        config: Record<string, unknown>;
        localMinions: VirgilLocalMinionsConfig;
      }
    >(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    moduleRef = await Test.createTestingModule({ imports: [ProbeModule] })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    service = moduleRef.get(LetheConfigService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  describe('load()', () => {
    it('returns default config when virgil.json has no lethe section', () => {
      mockConfigService.load.mockReturnValue({
        config: {},
        localMinions: dummyLocalMinions,
      });

      const result = service.load();

      expect(result).toEqual(defaultLetheConfig);
    });

    it('parses lethe config from virgil.json, defaulting missing task flags', () => {
      mockConfigService.load.mockReturnValue({
        config: {
          lethe: {
            enabled: true,
            tasks: { readFile: false },
          },
        },
        localMinions: dummyLocalMinions,
      });

      const result = service.load();

      expect(result).toEqual({
        enabled: true,
        tasks: {
          readFile: false,
          readJson: true,
          crawlDirs: true,
          rawInput: true,
          phaseOutput: true,
        },
      });
    });

    it('returns default config when ConfigService throws', () => {
      mockConfigService.load.mockImplementation(() => {
        throw new Error('virgil.json not found at project root.');
      });

      const result = service.load();

      expect(result).toEqual(defaultLetheConfig);
    });

    it('returns default config when lethe section is invalid', () => {
      mockConfigService.load.mockReturnValue({
        config: { lethe: 'not-an-object' },
        localMinions: dummyLocalMinions,
      });

      const result = service.load();

      expect(result).toEqual(defaultLetheConfig);
    });
  });
});
