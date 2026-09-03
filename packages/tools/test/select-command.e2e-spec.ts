import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { SelectCommand } from '../src/commands/index.js';
import {
  DmrClientService,
  ConfigService,
  HardwareDetectionService,
  FitnessScoringService,
} from '../src/services/index.js';

describe('SelectCommand (e2e)', () => {
  const testModel = 'ai/test-model';

  const fakeModelsResponse = {
    object: 'list',
    data: [
      { id: testModel, object: 'model' },
      { id: 'ai/other-model', object: 'model' },
    ],
  };

  const mockConfigService = {
    load: vi.fn().mockReturnValue({
      localMinions: { model: '' },
    }),
    save: vi.fn(),
    getConfigPath: vi.fn().mockReturnValue('/fake/virgil.json'),
  };

  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue(fakeModelsResponse),
      })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(SelectCommand);
    expect(command).toBeDefined();
  });

  it('selects model and writes to config when model exists in DMR', async () => {
    const command = moduleRef.get(SelectCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]) + '\n';
      });

    await command.run([testModel]);

    expect(logSpy).toHaveBeenCalled();
    expect(captured).toContain(`Model selected: "${testModel}"`);
    expect(captured).toContain('Updated virgil.json');
    expect(mockConfigService.save).toHaveBeenCalledWith(
      expect.objectContaining({ model: testModel }),
    );

    logSpy.mockRestore();
  });

  it('reports error when model is not found in DMR', async () => {
    const command = moduleRef.get(SelectCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run(['ai/nonexistent'])).rejects.toThrow(
      'process.exit',
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found in DMR'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when no model name is provided', async () => {
    const command = moduleRef.get(SelectCommand);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([])).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when DMR returns ECONNREFUSED', async () => {
    const mod = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockRejectedValue(new Error('fetch failed')),
      })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    const command = mod.get(SelectCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([testModel])).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach DMR'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await mod.close();
  });

  it('re-throws non-connection errors from fetchModels', async () => {
    const mod = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi
          .fn()
          .mockRejectedValue(new Error('unexpected error')),
      })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    const command = mod.get(SelectCommand);

    await expect(command.run([testModel])).rejects.toThrow(
      'unexpected error',
    );

    await mod.close();
  });

  it('exits with error when model does not fit on hardware', async () => {
    const mockFitness = {
      score: vi.fn().mockReturnValue({
        model: testModel,
        fits: false,
        score: 0,
        ramNeededGb: 40,
        diskNeededGb: 25,
        ramAvailableGb: 12,
        tier: 'pro',
      }),
    };
    const mod = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue(fakeModelsResponse),
      })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(FitnessScoringService)
      .useValue(mockFitness)
      .compile();

    const command = mod.get(SelectCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    // Use a name that exists in MODEL_CATALOG so catalogEntry is found
    await expect(command.run(['llama3.1:8b'])).rejects.toThrow(
      'process.exit',
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not fit on this hardware'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await mod.close();
  });
});
