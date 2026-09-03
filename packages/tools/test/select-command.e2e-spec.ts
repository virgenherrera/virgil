import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { SelectCommand } from '../src/commands/index.js';
import { DmrClientService, ConfigService } from '../src/services/index.js';

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
});
