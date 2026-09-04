import { Test, TestingModule } from '@nestjs/testing';
import { ProviderModule } from '../src/provider/provider.module.js';
import { ProviderCommand } from '../src/provider/provider.command.js';
import { ProviderAddCommand } from '../src/provider/provider-add.command.js';
import { ProviderListCommand } from '../src/provider/provider-list.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('ProviderCommands', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [ProviderModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // --- provider add ---

  it('adds provider with type arg in CLI mode (BDD-026)', async () => {
    const command = module.get(ProviderAddCommand);
    await command.run(['repo'], {});

    expect(promptService.select).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('repo');
  });

  it('prompts with select in TUI mode when no type arg (BDD-027)', async () => {
    vi.mocked(promptService.select).mockResolvedValue('knowledge');
    const command = module.get(ProviderAddCommand);
    await command.run([], {});

    expect(promptService.select).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs provider add as JSON (BDD-028)', async () => {
    const command = module.get(ProviderAddCommand);
    await command.run(['repo'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('type', 'repo');
    expect(output).toHaveProperty('status', 'active');
  });

  it('throws NonTtyError in non-TTY when no type arg (BDD-054)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.select).mockRejectedValue(
      new NonTtyError('Select provider type'),
    );

    const command = module.get(ProviderAddCommand);
    await expect(command.run([], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  // --- provider list ---

  it('lists providers in text mode (BDD-029)', async () => {
    const command = module.get(ProviderListCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('GitHub');
  });

  it('lists providers as JSON (BDD-029-json)', async () => {
    const command = module.get(ProviderListCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    expect(output[0]).toHaveProperty('id');
    expect(output[0]).toHaveProperty('type');
    expect(output[0]).toHaveProperty('name');
    expect(output[0]).toHaveProperty('status');
  });

  // --- parent command ---

  it('prints usage when provider is run without subcommand', async () => {
    const command = module.get(ProviderCommand);
    const helpFn = vi.fn();
    (command as any).command = { help: helpFn };
    await command.run();

    expect(helpFn).toHaveBeenCalledTimes(1);
  });

  // --- option parsers ---

  it('add parseJson returns true', () => {
    const command = module.get(ProviderAddCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('list parseJson returns true', () => {
    const command = module.get(ProviderListCommand);
    expect(command.parseJson()).toBe(true);
  });
});
