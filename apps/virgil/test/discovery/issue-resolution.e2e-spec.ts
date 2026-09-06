import { IssueResolutionService } from '../../src/discovery/issue-resolution.service.js';
import type { IssueProvider, NormalisedIssue } from '../../src/contracts/issue-provider.types.js';
import { IssueStatus } from '../../src/contracts/issue-provider.types.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import type { SemVer } from '../../src/shared/primitives.js';

function makeMockIssueProvider(): IssueProvider {
  return {
    getIssue: vi.fn(),
    search: vi.fn(),
    listRelated: vi.fn(),
    health: vi.fn(),
    initialize: vi.fn(),
    healthCheck: vi.fn(),
    dispose: vi.fn(),
    metadata: { id: 'test', name: 'test', version: '0.1.0' as SemVer, capabilities: [] },
    status: ProviderStatus.CONNECTED,
  };
}

function makeIssue(id: string): NormalisedIssue {
  return {
    id,
    externalId: `ext-${id}`,
    title: `Issue ${id}`,
    description: 'Test description',
    status: IssueStatus.OPEN,
    labels: ['bug'],
    references: [],
    identity: { uri: `issue://${id}`, hash: createContentHash(id), discoveredAt: createTimestamp() },
    metadata: {},
  };
}

describe('IssueResolutionService', () => {
  let service: IssueResolutionService;
  let mockProvider: IssueProvider;

  beforeEach(() => {
    mockProvider = makeMockIssueProvider();
    service = new IssueResolutionService(mockProvider);
  });

  it('delegates to issueProvider.getIssue', async () => {
    const issue = makeIssue('PROJ-1');
    vi.mocked(mockProvider.getIssue).mockResolvedValue(issue);

    const result = await service.resolve('PROJ-1');

    expect(mockProvider.getIssue).toHaveBeenCalledWith('PROJ-1');
    expect(result).toBe(issue);
  });

  it('propagates errors from provider', async () => {
    vi.mocked(mockProvider.getIssue).mockRejectedValue(new Error('Not found'));

    await expect(service.resolve('MISSING')).rejects.toThrow('Not found');
  });
});
