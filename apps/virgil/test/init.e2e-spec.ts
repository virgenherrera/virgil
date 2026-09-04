import { Test, TestingModule } from '@nestjs/testing';
import { InitModule } from '../src/init/init.module.js';
import { InitCommand } from '../src/init/init.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('InitCommand', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [InitModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('uses cwd when no path arg is provided (BDD-001)', async () => {
    const command = module.get(InitCommand);
    await command.run([], { slug: 'my-project', name: 'My Project' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain(process.cwd());
  });

  it('skips prompts when --slug and --name are provided (BDD-002)', async () => {
    const command = module.get(InitCommand);
    await command.run(['/tmp/test-dir'], {
      slug: 'test-slug',
      name: 'Test Name',
    });

    expect(promptService.input).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('test-slug');
  });

  it('sanitizes dirname into a valid slug (BDD-003)', async () => {
    const command = module.get(InitCommand);
    await command.run(['/tmp/My Cool Project'], { name: 'Cool' });

    expect(promptService.input).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('my-cool-project');
  });

  it('prompts for slug when dirname produces invalid slug in TUI mode (BDD-004)', async () => {
    vi.mocked(promptService.input).mockResolvedValue('valid-slug');
    const command = module.get(InitCommand);
    // A dirname starting with a digit or that is empty after sanitization
    await command.run(['/tmp/123'], { name: 'Num' });

    expect(promptService.input).toHaveBeenCalledWith('Workspace slug');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('valid-slug');
  });

  it('throws NonTtyError when slug is invalid and no --slug in non-TTY (BDD-005)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Workspace slug'),
    );

    const command = module.get(InitCommand);

    await expect(command.run(['/tmp/123'], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  it('skips provider wizard when --skip-providers is set (BDD-006)', async () => {
    const command = module.get(InitCommand);
    await command.run(['/tmp/my-project'], {
      slug: 'my-project',
      skipProviders: true,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('my-project');
  });

  it('outputs JSON matching InitOutputSchema with --json (BDD-007)', async () => {
    const command = module.get(InitCommand);
    await command.run(['/tmp/my-project'], {
      slug: 'my-project',
      name: 'My Project',
      json: true,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('workspace');
    expect(output).toHaveProperty('path');
    expect(output).toHaveProperty('name');
    expect(output).toHaveProperty('created');
    expect(output.created).toBe(true);
  });

  it('throws NonTtyError when non-TTY and no args (BDD-008)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Workspace slug'),
    );

    const command = module.get(InitCommand);

    // cwd sanitization may fail validation, requiring a prompt
    // If cwd happens to sanitize to a valid slug, we force an invalid path
    await expect(command.run(['/tmp/---'], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  // --- option parsers ---

  it('parseSlug returns the value', () => {
    const command = module.get(InitCommand);
    expect(command.parseSlug('my-slug')).toBe('my-slug');
  });

  it('parseName returns the value', () => {
    const command = module.get(InitCommand);
    expect(command.parseName('My Name')).toBe('My Name');
  });

  it('parseSkipProviders returns true', () => {
    const command = module.get(InitCommand);
    expect(command.parseSkipProviders()).toBe(true);
  });

  it('parseJson returns true', () => {
    const command = module.get(InitCommand);
    expect(command.parseJson()).toBe(true);
  });
});
