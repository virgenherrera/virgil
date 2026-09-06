import { Test } from '@nestjs/testing';
import { IssuesModule } from '../../src/issues/issues.module.js';
import { GitHubAdapterSelectorService } from '../../src/issues/github-adapter-selector.service.js';
import { HTTP_CLIENT } from '../../src/issues/issues-http-client.js';

describe('IssuesModule', () => {
  it('provides GitHubAdapterSelectorService', async () => {
    const module = await Test.createTestingModule({
      imports: [IssuesModule],
    }).compile();

    const service = module.get(GitHubAdapterSelectorService);
    expect(service).toBeInstanceOf(GitHubAdapterSelectorService);
  });

  it('provides HTTP_CLIENT', async () => {
    const module = await Test.createTestingModule({
      imports: [IssuesModule],
    }).compile();

    const client = module.get(HTTP_CLIENT);
    expect(client).toBeDefined();
  });
});
