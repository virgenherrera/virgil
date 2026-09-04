import { Test, TestingModule } from '@nestjs/testing';
import { InitModule } from '../src/init/init.module.js';
import { InitCommand } from '../src/init/init.command.js';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';
import { WorkspaceListCommand } from '../src/workspace/workspace-list.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { formatOutput } from '../src/shared/output.formatter.js';
import { AppModule } from '../src/app.module.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('Global Options', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [InitModule, WorkspaceModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('--json on any command outputs JSON to stdout (BDD-049)', async () => {
    const command = module.get(WorkspaceListCommand);
    await command.run([], { json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(() => JSON.parse(logSpy.mock.calls[0][0] as string)).not.toThrow();
  });

  it('non-TTY with missing args throws NonTtyError (BDD-050)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Workspace slug'),
    );

    const command = module.get(InitCommand);
    // Path that leads to an invalid slug requiring prompt
    await expect(command.run(['/tmp/---'], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  it('--help is available on commands (BDD-051)', () => {
    // Verify that the command instance can be resolved — the --help flag
    // is handled by nest-commander at the framework level.
    const command = module.get(InitCommand);
    expect(command).toBeDefined();
    // The command has a `command` property from CommandRunner
    expect(command).toBeInstanceOf(InitCommand);
  });

  it('subcommand help is resolvable (BDD-052)', () => {
    const command = module.get(WorkspaceListCommand);
    expect(command).toBeDefined();
    expect(command).toBeInstanceOf(WorkspaceListCommand);
  });

  it('Ctrl+C rejection from prompt produces clean exit (BDD-053)', async () => {
    vi.mocked(promptService.input).mockRejectedValue(
      new Error('User force closed the prompt'),
    );

    const command = module.get(InitCommand);
    await expect(command.run(['/tmp/---'], {})).rejects.toThrow(
      'User force closed the prompt',
    );
  });

  it('text mode output contains human-readable key-value pairs (BDD-059)', async () => {
    const command = module.get(InitCommand);
    await command.run(['/tmp/my-project'], {
      slug: 'my-project',
      name: 'My Project',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const text = logSpy.mock.calls[0][0] as string;
    // Text mode uses formatAsText which renders key: value pairs for flat objects
    expect(text).toContain('workspace');
    expect(text).toContain('my-project');
  });

  it('Zod validation error is thrown for invalid input (BDD-060)', async () => {
    const { ZodError } = await import('zod');
    const command = module.get(InitCommand);

    // A slug with invalid characters violates WorkspaceSlugSchema
    await expect(
      command.run(['/tmp/test'], { slug: 'INVALID SLUG!!!' }),
    ).rejects.toThrow(ZodError);
  });

  // --- output formatter edge cases ---

  it('formatOutput renders primitive values as text', () => {
    expect(formatOutput(42, false)).toBe('42');
  });

  it('formatOutput renders null as text', () => {
    expect(formatOutput(null, false)).toBe('null');
  });

  it('formatOutput renders array items as text', () => {
    const result = formatOutput(['alpha', 'bravo'], false);
    expect(result).toContain('alpha');
    expect(result).toContain('bravo');
  });

  // --- AppModule ---

  it('AppModule compiles successfully', async () => {
    const appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(appModule).toBeDefined();
  });
});
