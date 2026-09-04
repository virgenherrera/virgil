import { Test, TestingModule } from '@nestjs/testing';
import { RepoModule } from '../src/repo/repo.module.js';
import { RepoCommand } from '../src/repo/repo.command.js';
import { RepoAddCommand } from '../src/repo/repo-add.command.js';
import { RepoListCommand } from '../src/repo/repo-list.command.js';
import { RepoShowCommand } from '../src/repo/repo-show.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('RepoCommands', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [RepoModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // --- repo add ---

  it('adds repo with path arg in CLI mode (BDD-009)', async () => {
    vi.mocked(promptService.input).mockResolvedValue('');
    const command = module.get(RepoAddCommand);
    await command.run(['/home/user/my-repo', 'my-alias'], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('/home/user/my-repo');
  });

  it('prompts for path in TUI mode when no arg (BDD-010)', async () => {
    vi.mocked(promptService.input)
      .mockResolvedValueOnce('/prompted/path')
      .mockResolvedValueOnce('prompted-alias');
    const command = module.get(RepoAddCommand);
    await command.run([], {});

    expect(promptService.input).toHaveBeenCalledWith('Repository path');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('/prompted/path');
  });

  it('outputs repo add as JSON (BDD-011)', async () => {
    vi.mocked(promptService.input).mockResolvedValue('');
    const command = module.get(RepoAddCommand);
    await command.run(['/home/user/my-repo', 'my-alias'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('slug');
    expect(output).toHaveProperty('path', '/home/user/my-repo');
    expect(output).toHaveProperty('registered', true);
  });

  it('throws NonTtyError in non-TTY when no path arg (BDD-010-nontty)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Repository path'),
    );

    const command = module.get(RepoAddCommand);
    await expect(command.run([], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  // --- repo list ---

  it('lists repositories in text mode (BDD-012)', async () => {
    const command = module.get(RepoListCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('frontend');
  });

  it('lists repositories as JSON (BDD-013)', async () => {
    const command = module.get(RepoListCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    expect(output[0]).toHaveProperty('alias');
    expect(output[0]).toHaveProperty('path');
  });

  // --- repo show ---

  it('shows repo details with alias arg (BDD-014)', async () => {
    const command = module.get(RepoShowCommand);
    await command.run(['frontend'], {});

    expect(promptService.select).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('frontend');
  });

  it('prompts with select in TUI mode for show (BDD-014-tui)', async () => {
    vi.mocked(promptService.select).mockResolvedValue('backend');
    const command = module.get(RepoShowCommand);
    await command.run([], {});

    expect(promptService.select).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('backend');
  });

  it('outputs repo show as JSON (BDD-015)', async () => {
    const command = module.get(RepoShowCommand);
    await command.run(['frontend'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('alias', 'frontend');
    expect(output).toHaveProperty('path');
    expect(output).toHaveProperty('branch');
    expect(output).toHaveProperty('remoteUrl');
  });

  // --- parent command ---

  it('prints usage when repo is run without subcommand', async () => {
    const command = module.get(RepoCommand);
    const helpFn = vi.fn();
    (command as any).command = { help: helpFn };
    await command.run();

    expect(helpFn).toHaveBeenCalledTimes(1);
  });

  // --- option parsers ---

  it('add parseJson returns true', () => {
    const command = module.get(RepoAddCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('list parseJson returns true', () => {
    const command = module.get(RepoListCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('show parseJson returns true', () => {
    const command = module.get(RepoShowCommand);
    expect(command.parseJson()).toBe(true);
  });
});
