import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { DelegateCommand } from '../src/commands/index.js';
import { DmrClientService, ConfigService } from '../src/services/index.js';
import { DelegateResultSchema } from '../src/schemas/index.js';

describe('DelegateCommand (e2e)', () => {
  const testModel = 'ai/llama3.2:latest';

  const mockDmrClient = {
    chatCompletion: vi.fn().mockResolvedValue({
      content: 'test response',
      elapsed_ms: 100,
    }),
    fetchModels: vi.fn().mockResolvedValue({
      object: 'list',
      data: [{ id: testModel, object: 'model' }],
    }),
  };

  const mockConfigService = {
    load: vi.fn().mockReturnValue({
      config: {},
      localMinions: { model: testModel },
    }),
    save: vi.fn(),
    getConfigPath: vi.fn().mockReturnValue('/fake/virgil.json'),
    getRepoRoot: vi.fn().mockReturnValue('/fake'),
    hashProfile: vi.fn().mockReturnValue('abc123'),
  };

  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue(mockDmrClient)
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(command).toBeDefined();
  });

  it('delegates prompt to DMR and returns Zod-validated JSON', async () => {
    const command = moduleRef.get(DelegateCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    let stderrCaptured = '';
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        stderrCaptured += String(args[0]);
      });

    await command.run([], { prompt: 'Hello world' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = DelegateResultSchema.parse(JSON.parse(captured));
    expect(parsed).toEqual({
      content: 'test response',
      model: testModel,
      elapsed_ms: 100,
    });

    expect(stderrCaptured).toContain(`model=${testModel}`);
    expect(stderrCaptured).toContain('elapsed=100ms');
    expect(stderrCaptured).toContain('max_tokens=512');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('uses default system prompt and parameters when not provided', async () => {
    const command = moduleRef.get(DelegateCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { prompt: 'Hello world' });

    expect(mockDmrClient.chatCompletion).toHaveBeenCalledWith(
      testModel,
      'You are a helpful assistant. Be concise and precise.',
      'Hello world',
      { maxTokens: 512, temperature: 0 },
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('falls back to first available model when no config model', async () => {
    const fallbackModel = 'ai/fallback-model:latest';
    mockConfigService.load.mockReturnValue({
      config: {},
      localMinions: { model: null },
    });
    mockDmrClient.fetchModels.mockResolvedValue({
      object: 'list',
      data: [{ id: fallbackModel, object: 'model' }],
    });

    const command = moduleRef.get(DelegateCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { prompt: 'Hello world' });

    const parsed = DelegateResultSchema.parse(JSON.parse(captured));
    expect(parsed.model).toBe(fallbackModel);
    expect(mockDmrClient.fetchModels).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('falls back to fetchModels when config load throws', async () => {
    mockConfigService.load.mockImplementation(() => {
      throw new Error('config file missing');
    });
    mockDmrClient.fetchModels.mockResolvedValue({
      object: 'list',
      data: [{ id: testModel, object: 'model' }],
    });

    const command = moduleRef.get(DelegateCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { prompt: 'Hello world' });

    const parsed = DelegateResultSchema.parse(JSON.parse(captured));
    expect(parsed.model).toBe(testModel);
    expect(mockDmrClient.fetchModels).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('exits with error when no models available', async () => {
    mockConfigService.load.mockReturnValue({
      config: {},
      localMinions: { model: null },
    });
    mockDmrClient.fetchModels.mockResolvedValue({
      object: 'list',
      data: [],
    });

    const command = moduleRef.get(DelegateCommand);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([], { prompt: 'Hello world' })).rejects.toThrow(
      'process.exit',
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No model available'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when no prompt is provided', async () => {
    const command = moduleRef.get(DelegateCommand);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([], {})).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--prompt is required'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes options through to chatCompletion', async () => {
    const command = moduleRef.get(DelegateCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], {
      prompt: 'Explain this code',
      system: 'You are a code reviewer.',
      model: 'ai/custom-model',
      maxTokens: 1024,
      temperature: 0.5,
    });

    expect(mockDmrClient.chatCompletion).toHaveBeenCalledWith(
      'ai/custom-model',
      'You are a code reviewer.',
      'Explain this code',
      { maxTokens: 1024, temperature: 0.5 },
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('exits with error when chatCompletion ECONNREFUSED', async () => {
    mockDmrClient.chatCompletion.mockRejectedValueOnce(
      new Error('fetch failed: ECONNREFUSED'),
    );

    const command = moduleRef.get(DelegateCommand);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(
      command.run([], { prompt: 'Hello world', model: testModel }),
    ).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach DMR'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('re-throws non-connection errors from chatCompletion', async () => {
    mockDmrClient.chatCompletion.mockRejectedValueOnce(
      new Error('unexpected server error'),
    );

    const command = moduleRef.get(DelegateCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      command.run([], { prompt: 'Hello world', model: testModel }),
    ).rejects.toThrow('unexpected server error');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('parseMaxTokens rejects non-positive integers', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(() => command.parseMaxTokens('0')).toThrow('positive integer');
    expect(() => command.parseMaxTokens('-5')).toThrow('positive integer');
    expect(() => command.parseMaxTokens('abc')).toThrow('positive integer');
  });

  it('parseMaxTokens rejects values exceeding upper bound', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(() => command.parseMaxTokens('131073')).toThrow('max 131072');
  });

  it('parseMaxTokens accepts valid values', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(command.parseMaxTokens('1')).toBe(1);
    expect(command.parseMaxTokens('512')).toBe(512);
    expect(command.parseMaxTokens('131072')).toBe(131072);
  });

  it('parseTemperature rejects negative and out-of-range values', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(() => command.parseTemperature('-1')).toThrow('between 0 and 2');
    expect(() => command.parseTemperature('2.1')).toThrow('between 0 and 2');
    expect(() => command.parseTemperature('abc')).toThrow('between 0 and 2');
  });

  it('parseTemperature accepts valid values', () => {
    const command = moduleRef.get(DelegateCommand);
    expect(command.parseTemperature('0')).toBe(0);
    expect(command.parseTemperature('0.7')).toBeCloseTo(0.7);
    expect(command.parseTemperature('2')).toBe(2);
  });

  describe('Option parsers', () => {
    it('parsePrompt validates non-empty string', () => {
      const cmd = moduleRef.get(DelegateCommand);
      expect(cmd.parsePrompt('hello world')).toBe('hello world');
    });

    it('parseSystem returns value unchanged', () => {
      const cmd = moduleRef.get(DelegateCommand);
      expect(cmd.parseSystem('custom system')).toBe('custom system');
    });

    it('parseModel returns value unchanged', () => {
      const cmd = moduleRef.get(DelegateCommand);
      expect(cmd.parseModel('ai/llama3.2')).toBe('ai/llama3.2');
    });
  });
});
