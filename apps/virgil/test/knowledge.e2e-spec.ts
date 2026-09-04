import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeModule } from '../src/knowledge/knowledge.module.js';
import { KnowledgeCommand } from '../src/knowledge/knowledge.command.js';
import { KnowledgeSearchCommand } from '../src/knowledge/knowledge-search.command.js';
import { KnowledgeStatsCommand } from '../src/knowledge/knowledge-stats.command.js';
import { KnowledgeCompactCommand } from '../src/knowledge/knowledge-compact.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('KnowledgeCommands', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [KnowledgeModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // --- knowledge search ---

  it('searches with query arg in CLI mode (BDD-019)', async () => {
    const command = module.get(KnowledgeSearchCommand);
    await command.run(['auth'], {});

    expect(promptService.input).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('auth');
  });

  it('prompts for query in TUI mode when no arg (BDD-020)', async () => {
    vi.mocked(promptService.input).mockResolvedValue('tokens');
    const command = module.get(KnowledgeSearchCommand);
    await command.run([], {});

    expect(promptService.input).toHaveBeenCalledWith('Search query');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs search results as JSON (BDD-021)', async () => {
    const command = module.get(KnowledgeSearchCommand);
    await command.run(['auth'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    expect(output[0]).toHaveProperty('id');
    expect(output[0]).toHaveProperty('title');
    expect(output[0]).toHaveProperty('snippet');
    expect(output[0]).toHaveProperty('score');
    expect(output[0]).toHaveProperty('source');
  });

  it('throws NonTtyError in non-TTY when no query arg (BDD-056)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Search query'),
    );

    const command = module.get(KnowledgeSearchCommand);
    await expect(command.run([], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  // --- knowledge stats ---

  it('shows stats in text mode (BDD-022)', async () => {
    const command = module.get(KnowledgeStatsCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('totalItems');
  });

  it('outputs stats as JSON (BDD-023)', async () => {
    const command = module.get(KnowledgeStatsCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('totalItems');
    expect(output).toHaveProperty('hotItems');
    expect(output).toHaveProperty('warmItems');
    expect(output).toHaveProperty('coldItems');
    expect(output).toHaveProperty('lastCompaction');
  });

  // --- knowledge compact ---

  it('compacts with --yes skipping confirmation (BDD-024)', async () => {
    const command = module.get(KnowledgeCompactCommand);
    await command.run([], { yes: true });

    expect(promptService.confirm).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('compacted');
  });

  it('prompts for confirmation in TUI mode (BDD-024-tui)', async () => {
    vi.mocked(promptService.confirm).mockResolvedValue(true);
    const command = module.get(KnowledgeCompactCommand);
    await command.run([], {});

    expect(promptService.confirm).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels compaction when confirmation denied (BDD-024-deny)', async () => {
    vi.mocked(promptService.confirm).mockResolvedValue(false);
    const command = module.get(KnowledgeCompactCommand);
    await command.run([], {});

    expect(promptService.confirm).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('cancelled');
  });

  it('outputs compact result as JSON (BDD-024-json)', async () => {
    const command = module.get(KnowledgeCompactCommand);
    await command.run([], { yes: true, json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('compacted');
    expect(output).toHaveProperty('removed');
    expect(output).toHaveProperty('duration');
  });

  // --- parent command ---

  it('shows help when knowledge is run without subcommand', async () => {
    const command = module.get(KnowledgeCommand);
    (command as any).command = { help: vi.fn() };
    await command.run();

    expect((command as any).command.help).toHaveBeenCalledTimes(1);
  });

  // --- option parsers ---

  it('search parseJson returns true', () => {
    const command = module.get(KnowledgeSearchCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('stats parseJson returns true', () => {
    const command = module.get(KnowledgeStatsCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('compact parseYes returns true', () => {
    const command = module.get(KnowledgeCompactCommand);
    expect(command.parseYes()).toBe(true);
  });

  it('compact parseJson returns true', () => {
    const command = module.get(KnowledgeCompactCommand);
    expect(command.parseJson()).toBe(true);
  });
});
