import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { BenchmarkCommand } from '../src/commands/index.js';
import { DmrClientService } from '../src/services/index.js';

describe('BenchmarkCommand (e2e)', () => {
  const testModel = 'ai/test-model';

  const fakeModelsResponse = {
    object: 'list',
    data: [
      { id: testModel, object: 'model' },
      { id: 'ai/other-model', object: 'model' },
    ],
  };

  const fakeAttempt = (correct: boolean) => ({
    attempt: 1,
    elapsed_ms: 150,
    json_valid: true,
    strict_correct: correct,
    raw_content: '{"result": "test"}',
  });

  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    })
      .overrideProvider(DmrClientService)
      .useValue({
        fetchModels: vi.fn().mockResolvedValue(fakeModelsResponse),
        fixtureStructuredJson: vi
          .fn()
          .mockResolvedValue([
            fakeAttempt(true),
            fakeAttempt(true),
            fakeAttempt(false),
          ]),
        fixtureClassification: vi
          .fn()
          .mockResolvedValue([
            fakeAttempt(true),
            fakeAttempt(true),
            fakeAttempt(true),
          ]),
        fixtureDiagnosis: vi
          .fn()
          .mockResolvedValue([
            fakeAttempt(true),
            fakeAttempt(false),
            fakeAttempt(true),
          ]),
        fixtureLatency: vi.fn().mockResolvedValue([120, 130, 140, 135, 125]),
      })
      .compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(BenchmarkCommand);
    expect(command).toBeDefined();
  });

  it('outputs benchmark results for a valid model', async () => {
    const command = moduleRef.get(BenchmarkCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]) + '\n';
      });

    await command.run([testModel]);

    expect(logSpy).toHaveBeenCalled();
    expect(captured).toContain('Benchmarking model');
    expect(captured).toContain('Qualification Verdict');
    expect(captured).toContain('Worker:');
    expect(captured).toContain('Reasoning:');
    expect(captured).toContain(testModel);

    logSpy.mockRestore();
  });

  it('reports error when model is not found in DMR', async () => {
    const command = moduleRef.get(BenchmarkCommand);
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
