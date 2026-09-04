import { Test, TestingModule } from '@nestjs/testing';
import { RepoModule } from '../src/repo/repo.module.js';
import { KnowledgeModule } from '../src/knowledge/knowledge.module.js';
import { ProviderModule } from '../src/provider/provider.module.js';
import { RepoRemoveCommand } from '../src/repo/repo-remove.command.js';
import { KnowledgeAddCommand } from '../src/knowledge/knowledge-add.command.js';
import { KnowledgeListCommand } from '../src/knowledge/knowledge-list.command.js';
import { KnowledgeRemoveCommand } from '../src/knowledge/knowledge-remove.command.js';
import { ProviderTestCommand } from '../src/provider/provider-test.command.js';
import { ProviderRemoveCommand } from '../src/provider/provider-remove.command.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('TBD Stub Commands', () => {
  let repoModule: TestingModule;
  let knowledgeModule: TestingModule;
  let providerModule: TestingModule;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const promptService = createMockPromptService();

    [repoModule, knowledgeModule, providerModule] = await Promise.all([
      Test.createTestingModule({ imports: [RepoModule] })
        .overrideProvider(PromptService)
        .useValue(promptService)
        .compile(),
      Test.createTestingModule({ imports: [KnowledgeModule] })
        .overrideProvider(PromptService)
        .useValue(promptService)
        .compile(),
      Test.createTestingModule({ imports: [ProviderModule] })
        .overrideProvider(PromptService)
        .useValue(promptService)
        .compile(),
    ]);

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('repo remove prints GAP-002 stub (BDD-016)', async () => {
    const command = repoModule.get(RepoRemoveCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('GAP-002');
  });

  it('knowledge add prints redirect stub (BDD-017)', async () => {
    const command = knowledgeModule.get(KnowledgeAddCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('provider add');
  });

  it('knowledge list prints redirect stub (BDD-018)', async () => {
    const command = knowledgeModule.get(KnowledgeListCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('provider list');
  });

  it('knowledge remove prints redirect stub (BDD-025)', async () => {
    const command = knowledgeModule.get(KnowledgeRemoveCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('provider remove');
  });

  it('provider test prints GAP-003 stub (BDD-030)', async () => {
    const command = providerModule.get(ProviderTestCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('GAP-003');
  });

  it('provider remove prints GAP-003 stub (BDD-031)', async () => {
    const command = providerModule.get(ProviderRemoveCommand);
    await command.run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('GAP-003');
  });
});
