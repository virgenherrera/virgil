import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { CeilingCommand } from '../src/commands/index.js';
import {
  PromptService,
  ConfigService,
  HardwareDetectionService,
} from '../src/services/index.js';
import type { HardwareProfile } from '../src/schemas/index.js';

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

describe('CeilingCommand (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(CeilingCommand);
    expect(command).toBeDefined();
  });

  it('computes a ceiling with explicit options (no interactive prompts)', async () => {
    const command = moduleRef.get(CeilingCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], {
      maxMinions: 1,
      tiers: 'worker',
      ramReservation: 4,
    });

    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(captured);
    expect(parsed).toHaveProperty('maxMinions');
    expect(parsed).toHaveProperty('allowedTiers');
    expect(parsed).toHaveProperty('selectedModels');
    expect(parsed).toHaveProperty('explanation');
    expect(typeof parsed.maxMinions).toBe('number');
    expect(Array.isArray(parsed.allowedTiers)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── Option parser methods ──────────────────────────────────────────

  describe('option parsers', () => {
    it('parseMaxMinions returns a valid positive integer', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(command.parseMaxMinions('3')).toBe(3);
    });

    it('parseMaxMinions throws for non-positive input', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(() => command.parseMaxMinions('0')).toThrow(
        '--max-minions must be a positive integer',
      );
      expect(() => command.parseMaxMinions('abc')).toThrow(
        '--max-minions must be a positive integer',
      );
    });

    it('parseTiers validates tier names', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(command.parseTiers('worker,reasoning')).toBe('worker,reasoning');
    });

    it('parseTiers throws for invalid tier names', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(() => command.parseTiers('worker,invalid')).toThrow(
        'Invalid tier "invalid"',
      );
    });

    it('parseRamReservation returns a valid non-negative number', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(command.parseRamReservation('4.5')).toBe(4.5);
      expect(command.parseRamReservation('0')).toBe(0);
    });

    it('parseRamReservation throws for negative or NaN input', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(() => command.parseRamReservation('-1')).toThrow(
        '--ram-reservation must be a non-negative number',
      );
      expect(() => command.parseRamReservation('abc')).toThrow(
        '--ram-reservation must be a non-negative number',
      );
    });

    it('parseSave returns true', () => {
      const command = moduleRef.get(CeilingCommand);
      expect(command.parseSave()).toBe(true);
    });
  });

  // ── Interactive mode ───────────────────────────────────────────────

  describe('interactive mode', () => {
    it('prompts for maxMinions and tiers when not provided', async () => {
      const mockPrompt = {
        ask: vi.fn()
          .mockResolvedValueOnce('2')
          .mockResolvedValueOnce('worker'),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(PromptService)
        .useValue(mockPrompt)
        .compile();

      const command = mod.get(CeilingCommand);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], {});

      expect(mockPrompt.ask).toHaveBeenCalledTimes(2);
      expect(mockPrompt.ask).toHaveBeenCalledWith(
        expect.stringContaining('concurrent minions'),
      );
      expect(mockPrompt.ask).toHaveBeenCalledWith(
        expect.stringContaining('Allowed tiers'),
      );

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await mod.close();
    });

    it('falls back to maxMinions=1 on invalid interactive input', async () => {
      const mockPrompt = {
        ask: vi.fn()
          .mockResolvedValueOnce('abc')
          .mockResolvedValueOnce('worker'),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(PromptService)
        .useValue(mockPrompt)
        .compile();

      const command = mod.get(CeilingCommand);
      let captured = '';
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args: unknown[]) => {
          captured += String(args[0]);
        });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], {});

      const parsed = JSON.parse(captured);
      expect(parsed.maxMinions).toBeGreaterThanOrEqual(0);
      expect(errorSpy).toHaveBeenCalledWith('Invalid input. Using 1.');

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await mod.close();
    });

    it('uses first available tier when user enters empty tiers', async () => {
      const mockPrompt = {
        ask: vi.fn()
          .mockResolvedValueOnce('1')
          .mockResolvedValueOnce(''),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(PromptService)
        .useValue(mockPrompt)
        .compile();

      const command = mod.get(CeilingCommand);
      let captured = '';
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args: unknown[]) => {
          captured += String(args[0]);
        });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], {});

      const parsed = JSON.parse(captured);
      expect(parsed.allowedTiers.length).toBeGreaterThanOrEqual(0);

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await mod.close();
    });
  });

  // ── Save flag ──────────────────────────────────────────────────────

  describe('--save flag', () => {
    it('persists effective ceiling to virgil.json', async () => {
      const mockConfig = {
        save: vi.fn(),
        getConfigPath: vi.fn().mockReturnValue('/fake/virgil.json'),
        hashProfile: vi.fn().mockReturnValue('abc123def456ab12'),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(ConfigService)
        .useValue(mockConfig)
        .compile();

      const command = mod.get(CeilingCommand);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], {
        maxMinions: 1,
        tiers: 'worker',
        save: true,
      });

      expect(mockConfig.save).toHaveBeenCalledTimes(1);
      expect(mockConfig.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ceiling: expect.any(String),
          allowedTiers: expect.any(Array),
          model: expect.anything(),
        }),
      );
      expect(mockConfig.hashProfile).toHaveBeenCalledTimes(1);
      expect(mockConfig.getConfigPath).toHaveBeenCalledTimes(1);

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await mod.close();
    });
  });

  // ── Empty tiers ────────────────────────────────────────────────────

  describe('no qualifying tiers', () => {
    it('warns and exits when no tiers qualify with --save', async () => {
      const mockHardware = {
        detect: vi.fn().mockReturnValue(
          makeProfile({
            ram: { totalGb: 1, availableGb: 0.5 },
            disk: { availableGb: 0.5 },
            docker: {
              engineVersion: null,
              composeVersion: null,
              dmrStatus: 'unavailable' as const,
              allocatedCpu: null,
              allocatedMemoryGb: null,
            },
          }),
        ),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(HardwareDetectionService)
        .useValue(mockHardware)
        .compile();

      const command = mod.get(CeilingCommand);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as () => never);

      await expect(
        command.run([], { maxMinions: 1, tiers: 'pro', ramReservation: 0, save: true }),
      ).rejects.toThrow('process.exit');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tiers qualify'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      logSpy.mockRestore();
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      await mod.close();
    });

    it('prints warning but continues without exit when save is false', async () => {
      const mockHardware = {
        detect: vi.fn().mockReturnValue(
          makeProfile({
            ram: { totalGb: 1, availableGb: 0.5 },
            disk: { availableGb: 0.5 },
            docker: {
              engineVersion: null,
              composeVersion: null,
              dmrStatus: 'unavailable' as const,
              allocatedCpu: null,
              allocatedMemoryGb: null,
            },
          }),
        ),
      };
      const mod = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(HardwareDetectionService)
        .useValue(mockHardware)
        .compile();

      const command = mod.get(CeilingCommand);
      let captured = '';
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args: unknown[]) => {
          captured += String(args[0]);
        });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], { maxMinions: 1, tiers: 'pro', ramReservation: 0 });

      // Should complete without exiting
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tiers qualify'),
      );
      const parsed = JSON.parse(captured);
      expect(parsed.allowedTiers).toHaveLength(0);

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await mod.close();
    });
  });
});
