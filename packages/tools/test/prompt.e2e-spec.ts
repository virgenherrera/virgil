import { Test, TestingModule } from '@nestjs/testing';
import { createInterface } from 'node:readline';
import { ProbeModule } from '../src/probe.module.js';
import { PromptService } from '../src/services/index.js';

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

const mockCreateInterface = vi.mocked(createInterface);

describe('PromptService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: PromptService;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(async () => {
    vi.resetAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    service = moduleRef.get(PromptService);
  });

  afterEach(async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  it('returns the trimmed answer from readline when stdin is a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    const mockClose = vi.fn();
    mockCreateInterface.mockReturnValue({
      question: vi.fn((_q: string, cb: (answer: string) => void) => {
        cb('  test answer  ');
      }),
      close: mockClose,
    } as any);

    const result = await service.ask('What is your name?');

    expect(result).toBe('test answer');
    expect(mockCreateInterface).toHaveBeenCalledTimes(1);
    expect(mockCreateInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stderr,
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('throws when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: undefined,
      configurable: true,
    });

    await expect(service.ask('What?')).rejects.toThrow(
      'Interactive input required but stdin is not a TTY',
    );
    expect(mockCreateInterface).not.toHaveBeenCalled();
  });
});
