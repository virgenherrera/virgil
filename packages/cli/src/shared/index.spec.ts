import * as shared from './index.js';

describe('shared barrel', () => {
  it('re-exports primitives, provider, workspace, handoff, and knowledge modules', () => {
    expect(shared.createUlid).toBeTypeOf('function');
    expect(shared.ProviderCapability.CHAT).toBe('chat');
    expect(shared.WorkspaceConfigSchema).toBeDefined();
    expect(shared.HandoffStatus.DRAFT).toBe('draft');
    expect(shared.KnowledgeArtifactSchema).toBeDefined();
  });
});
