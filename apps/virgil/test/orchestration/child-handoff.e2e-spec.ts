import { ChildHandoffService } from '../../src/orchestration/child-handoff.service.js';
import type { ChildHandoffInput } from '../../src/orchestration/child-handoff.service.js';
import { HandoffProtocolFactory } from '../../src/handoff/handoff-protocol.service.js';
import { HandoffDependencyType } from '../../src/handoff/handoff-protocol.schema.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';

describe('ChildHandoffService', () => {
  let service: ChildHandoffService;
  let mockFactory: { create: ReturnType<typeof vi.fn> };

  function makeInput(overrides: Partial<ChildHandoffInput> = {}): ChildHandoffInput {
    return {
      taskName: 'child-task',
      objective: 'Do something',
      acceptanceCriteria: ['Criterion 1'],
      constraints: ['no-network'],
      components: [{ path: 'src/main.ts', description: 'Entry point' }],
      ragQueryHints: [{ query: 'how to do X', relevanceNote: 'important' }],
      dependencies: [{ type: 'handoff', id: 'dep-1', description: 'Upstream handoff' }],
      risks: [{ description: 'Risk 1', mitigation: 'Mitigate it' }],
      unresolvedQuestions: ['What about Y?'],
      evidenceRequired: ['coverage.json'],
      repoTargets: { workspaceId: 'ws-1', packages: ['pkg-a'] },
      source: {
        providerType: ProviderCapability.KNOWLEDGE,
        providerId: 'provider-1',
        sourceRef: 'ref-1',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockFactory = {
      create: vi.fn().mockReturnValue({ id: 'mock-envelope-id', title: 'child-task' }),
    };
    service = new ChildHandoffService(mockFactory as unknown as HandoffProtocolFactory);
  });

  it('calls handoffFactory.create with mapped input', () => {
    const input = makeInput();
    const envelope = service.generate(input);

    expect(mockFactory.create).toHaveBeenCalledOnce();
    expect(envelope).toEqual({ id: 'mock-envelope-id', title: 'child-task' });

    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.title).toBe('child-task');
    expect(createArg.objective).toBe('Do something');
    expect(createArg.source).toEqual(input.source);
    expect(createArg.repoTargets).toEqual(input.repoTargets);
  });

  it('maps acceptance criteria with indexed ids', () => {
    service.generate(makeInput({ acceptanceCriteria: ['A', 'B'] }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.partial.acceptanceCriteria).toEqual([
      { id: 'ac-1', description: 'A' },
      { id: 'ac-2', description: 'B' },
    ]);
  });

  it('preserves known HandoffDependencyType values', () => {
    service.generate(makeInput({
      dependencies: [{ type: 'handoff', id: 'd1', description: 'test' }],
    }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.partial.dependencies[0].type).toBe(HandoffDependencyType.HANDOFF);
  });

  it('maps unknown dependency type to EXTERNAL', () => {
    service.generate(makeInput({
      dependencies: [{ type: 'unknown_type', id: 'd1', description: 'test' }],
    }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.partial.dependencies[0].type).toBe(HandoffDependencyType.EXTERNAL);
  });

  it('passes parentId when provided', () => {
    service.generate(makeInput({ parentId: 'parent-123' as string }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.parentId).toBe('parent-123');
  });

  it('maps components without optional description', () => {
    service.generate(makeInput({
      components: [{ path: 'src/index.ts' }],
    }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.partial.components).toEqual([{ path: 'src/index.ts' }]);
  });

  it('maps risks without optional mitigation', () => {
    service.generate(makeInput({
      risks: [{ description: 'bare risk' }],
    }));
    const createArg = mockFactory.create.mock.calls[0][0];
    expect(createArg.partial.risks).toEqual([{ description: 'bare risk' }]);
  });
});
