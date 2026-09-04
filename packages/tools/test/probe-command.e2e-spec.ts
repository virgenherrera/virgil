import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { ProbeCommand } from '../src/commands/index.js';
import { DmrClientService } from '../src/services/index.js';

describe('ProbeCommand (e2e)', () => {
  const fakeModelsResponse = {
    object: 'list',
    data: [
      {
        id: 'ai/test-model',
        object: 'model',
        created: 1700000000,
        owned_by: 'test-org',
      },
      {
        id: 'ai/another-model',
        object: 'model',
        created: 1700000001,
        owned_by: 'test-org',
      },
    ],
  };

  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue(fakeModelsResponse),
      })
      .compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(ProbeCommand);
    expect(command).toBeDefined();
  });

  it('outputs model info from DMR to stdout', async () => {
    const command = moduleRef.get(ProbeCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]) + '\n';
      });

    await command.run([]);

    expect(logSpy).toHaveBeenCalled();
    expect(captured).toContain('ai/test-model');
    expect(captured).toContain('ai/another-model');
    expect(captured).toContain('Found 2 model(s)');

    logSpy.mockRestore();
  });

  it('reports error when DMR is unavailable (fetch failed)', async () => {
    const errorModule = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockRejectedValue(new Error('fetch failed')),
      })
      .compile();

    const command = errorModule.get(ProbeCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([])).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach DMR'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await errorModule.close();
  });

  it('reports error when DMR is unavailable (ECONNREFUSED)', async () => {
    const errorModule = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      })
      .compile();

    const command = errorModule.get(ProbeCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);

    await expect(command.run([])).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach DMR'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await errorModule.close();
  });

  it('re-throws non-connection errors', async () => {
    const errorModule = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockRejectedValue(new Error('unexpected error')),
      })
      .compile();

    const command = errorModule.get(ProbeCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(command.run([])).rejects.toThrow('unexpected error');

    logSpy.mockRestore();
    await errorModule.close();
  });

  it('handles empty models list', async () => {
    const emptyModule = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue({ object: 'list', data: [] }),
      })
      .compile();

    const command = emptyModule.get(ProbeCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]) + '\n';
      });

    await command.run([]);

    expect(captured).toContain('No models available');
    expect(captured).toContain('docker model pull');

    logSpy.mockRestore();
    await emptyModule.close();
  });

  it('displays extra unknown properties on model objects', async () => {
    const extraModule = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue({
          object: 'list',
          data: [
            {
              id: 'ai/extended-model',
              object: 'model',
              custom_field: 'custom_value',
            },
          ],
        }),
      })
      .compile();

    const command = extraModule.get(ProbeCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]) + '\n';
      });

    await command.run([]);

    expect(captured).toContain('custom_field');
    expect(captured).toContain('"custom_value"');

    logSpy.mockRestore();
    await extraModule.close();
  });
});
