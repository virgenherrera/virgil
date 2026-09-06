import { Test, TestingModule } from '@nestjs/testing';
import { RepoModule } from '../../src/repo/repo.module.js';
import { RepoCommand } from '../../src/repo/repo.command.js';
import { RepoAddCommand } from '../../src/repo/repo-add.command.js';
import { RepoListCommand } from '../../src/repo/repo-list.command.js';
import { RepoShowCommand } from '../../src/repo/repo-show.command.js';
import { RepoRemoveCommand } from '../../src/repo/repo-remove.command.js';
import { LocalRepoProviderFactory } from '../../src/repo/local-repo-provider.factory.js';
import { CodeGraphService } from '../../src/repo/codegraph.service.js';
import { RepoService } from '../../src/repo/repo.service.js';
import { PromptService } from '../../src/shared/prompt.service.js';
import { createMockPromptService } from '../support/mock-prompt.service.js';

describe('RepoModule DI wiring', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RepoModule],
    })
      .overrideProvider(PromptService)
      .useValue(createMockPromptService())
      .compile();
  });

  it('provides LocalRepoProviderFactory', () => {
    expect(module.get(LocalRepoProviderFactory)).toBeDefined();
  });

  it('provides CodeGraphService', () => {
    expect(module.get(CodeGraphService)).toBeDefined();
  });

  it('provides RepoService', () => {
    expect(module.get(RepoService)).toBeDefined();
  });

  it('provides RepoCommand', () => {
    expect(module.get(RepoCommand)).toBeDefined();
  });

  it('provides RepoAddCommand', () => {
    expect(module.get(RepoAddCommand)).toBeDefined();
  });

  it('provides RepoListCommand', () => {
    expect(module.get(RepoListCommand)).toBeDefined();
  });

  it('provides RepoShowCommand', () => {
    expect(module.get(RepoShowCommand)).toBeDefined();
  });

  it('provides RepoRemoveCommand', () => {
    expect(module.get(RepoRemoveCommand)).toBeDefined();
  });

  it('exports LocalRepoProviderFactory', async () => {
    const consumerModule = await Test.createTestingModule({
      imports: [RepoModule],
    })
      .overrideProvider(PromptService)
      .useValue(createMockPromptService())
      .compile();

    expect(consumerModule.get(LocalRepoProviderFactory)).toBeDefined();
  });

  it('exports CodeGraphService', async () => {
    const consumerModule = await Test.createTestingModule({
      imports: [RepoModule],
    })
      .overrideProvider(PromptService)
      .useValue(createMockPromptService())
      .compile();

    expect(consumerModule.get(CodeGraphService)).toBeDefined();
  });
});
