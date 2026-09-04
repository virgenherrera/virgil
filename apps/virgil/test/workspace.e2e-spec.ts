import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';
import { WorkspaceCommand } from '../src/workspace/workspace.command.js';
import { WorkspaceCreateCommand } from '../src/workspace/workspace-create.command.js';
import { WorkspaceListCommand } from '../src/workspace/workspace-list.command.js';
import { WorkspaceSelectCommand } from '../src/workspace/workspace-select.command.js';
import { WorkspaceShowCommand } from '../src/workspace/workspace-show.command.js';
import { WorkspaceDeleteCommand } from '../src/workspace/workspace-delete.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('WorkspaceCommands', () => {
  let module: TestingModule;
  let promptService: ReturnType<typeof createMockPromptService>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptService = createMockPromptService();

    module = await Test.createTestingModule({
      imports: [WorkspaceModule],
    })
      .overrideProvider(PromptService)
      .useValue(promptService)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // --- workspace create ---

  it('creates workspace with slug arg in CLI mode (BDD-036)', async () => {
    const command = module.get(WorkspaceCreateCommand);
    await command.run(['my-ws'], {});

    expect(promptService.input).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('my-ws');
  });

  it('prompts for slug in TUI mode when no arg (BDD-037)', async () => {
    vi.mocked(promptService.input).mockResolvedValue('prompted-ws');
    const command = module.get(WorkspaceCreateCommand);
    await command.run([], {});

    expect(promptService.input).toHaveBeenCalledWith('Workspace slug');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('prompted-ws');
  });

  it('outputs workspace create result as JSON (BDD-038)', async () => {
    const command = module.get(WorkspaceCreateCommand);
    await command.run(['my-ws'], { name: 'My WS', json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('slug', 'my-ws');
    expect(output).toHaveProperty('name', 'My WS');
    expect(output).toHaveProperty('created', true);
  });

  it('uses slug as name when --name not provided (BDD-055)', async () => {
    const command = module.get(WorkspaceCreateCommand);
    await command.run(['auto-name'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.name).toBe('auto-name');
  });

  // --- workspace list ---

  it('lists all workspaces in text mode (BDD-039)', async () => {
    const command = module.get(WorkspaceListCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('workspaces');
  });

  it('lists workspaces as JSON (BDD-040)', async () => {
    const command = module.get(WorkspaceListCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('workspaces');
    expect(Array.isArray(output.workspaces)).toBe(true);
    expect(output.workspaces.length).toBeGreaterThan(0);
    expect(output.workspaces[0]).toHaveProperty('slug');
    expect(output.workspaces[0]).toHaveProperty('name');
    expect(output.workspaces[0]).toHaveProperty('active');
  });

  // --- workspace select ---

  it('selects workspace with slug arg in CLI mode (BDD-041)', async () => {
    const command = module.get(WorkspaceSelectCommand);
    await command.run(['my-workspace'], {});

    expect(promptService.select).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('my-workspace');
  });

  it('prompts with select in TUI mode when no arg (BDD-042)', async () => {
    vi.mocked(promptService.select).mockResolvedValue('other-project');
    const command = module.get(WorkspaceSelectCommand);
    await command.run([], {});

    expect(promptService.select).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('other-project');
  });

  it('outputs select result as JSON (BDD-043)', async () => {
    const command = module.get(WorkspaceSelectCommand);
    await command.run(['my-workspace'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('slug', 'my-workspace');
    expect(output).toHaveProperty('selected', true);
  });

  // --- workspace show ---

  it('shows workspace details with slug arg (BDD-044)', async () => {
    const command = module.get(WorkspaceShowCommand);
    await command.run(['my-workspace'], {});

    expect(promptService.select).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('my-workspace');
  });

  it('prompts with select in TUI mode for show (BDD-044-tui)', async () => {
    vi.mocked(promptService.select).mockResolvedValue('my-workspace');
    const command = module.get(WorkspaceShowCommand);
    await command.run([], {});

    expect(promptService.select).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs show result as JSON (BDD-045)', async () => {
    const command = module.get(WorkspaceShowCommand);
    await command.run(['my-workspace'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('slug', 'my-workspace');
    expect(output).toHaveProperty('name');
    expect(output).toHaveProperty('path');
    expect(output).toHaveProperty('active');
  });

  // --- workspace delete ---

  it('deletes workspace with slug arg and --confirm (BDD-046)', async () => {
    const command = module.get(WorkspaceDeleteCommand);
    await command.run(['my-workspace'], { confirm: true });

    expect(promptService.select).not.toHaveBeenCalled();
    expect(promptService.confirm).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);

    const text = logSpy.mock.calls[0][0] as string;
    expect(text).toContain('my-workspace');
  });

  it('prompts for workspace and confirmation in TUI mode for delete (BDD-046-tui)', async () => {
    vi.mocked(promptService.select).mockResolvedValue('other-project');
    vi.mocked(promptService.confirm).mockResolvedValue(true);
    const command = module.get(WorkspaceDeleteCommand);
    await command.run([], {});

    expect(promptService.select).toHaveBeenCalledTimes(1);
    expect(promptService.confirm).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs delete result as JSON (BDD-046-json)', async () => {
    const command = module.get(WorkspaceDeleteCommand);
    await command.run(['my-workspace'], { confirm: true, json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('slug', 'my-workspace');
    expect(output).toHaveProperty('deleted', true);
  });

  it('reports deleted:false when confirmation denied (BDD-046-deny)', async () => {
    vi.mocked(promptService.confirm).mockResolvedValue(false);
    const command = module.get(WorkspaceDeleteCommand);
    await command.run(['my-workspace'], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('deleted', false);
  });

  it('throws NonTtyError in non-TTY when no slug for create (BDD-037-nontty)', async () => {
    const originalTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as unknown as boolean;

    vi.mocked(promptService.input).mockRejectedValue(
      new NonTtyError('Workspace slug'),
    );

    const command = module.get(WorkspaceCreateCommand);
    await expect(command.run([], {})).rejects.toThrow(NonTtyError);

    process.stdin.isTTY = originalTTY;
  });

  // --- parent command ---

  it('shows help when workspace is run without subcommand', async () => {
    const command = module.get(WorkspaceCommand);
    (command as any).command = { help: vi.fn() };
    await command.run();

    expect((command as any).command.help).toHaveBeenCalledTimes(1);
  });

  // --- option parsers ---

  it('create parseName returns the value', () => {
    const command = module.get(WorkspaceCreateCommand);
    expect(command.parseName('My WS')).toBe('My WS');
  });

  it('create parseJson returns true', () => {
    const command = module.get(WorkspaceCreateCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('delete parseConfirm returns true', () => {
    const command = module.get(WorkspaceDeleteCommand);
    expect(command.parseConfirm()).toBe(true);
  });

  it('delete parseJson returns true', () => {
    const command = module.get(WorkspaceDeleteCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('list parseJson returns true', () => {
    const command = module.get(WorkspaceListCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('select parseJson returns true', () => {
    const command = module.get(WorkspaceSelectCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('show parseJson returns true', () => {
    const command = module.get(WorkspaceShowCommand);
    expect(command.parseJson()).toBe(true);
  });
});
