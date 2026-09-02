import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HandoffEnvelopeSchema,
  HandoffStatus,
  KnowledgeArtifactSchema,
  ProviderCapability,
  WorkspaceConfigSchema,
  WorkspaceIdSchema,
  assertValidHandoffTransition,
  createContentHash,
  createTimestamp,
  createUlid,
} from '../src/shared/index.js';
import type {
  HandoffEnvelope,
  KnowledgeArtifact,
  WorkspaceConfig,
} from '../src/shared/index.js';

/**
 * Stand-in for a future domain service (e.g. the knowledge-ingestion or
 * handoff-lifecycle module): composes the shared primitives/factories to
 * build real entities, mirroring how a concrete feature module would use
 * them together rather than exercising each primitive in isolation.
 */
@Injectable()
class KnowledgeAndHandoffFactoryService {
  createKnowledgeArtifact(sourceUri: string, content: string): KnowledgeArtifact {
    const now = createTimestamp();

    return {
      id: createUlid(),
      contentHash: createContentHash(content),
      sourceUri,
      mimeType: 'text/plain',
      title: 'Sample artifact',
      createdAt: now,
      updatedAt: now,
      providerId: 'mock-provider',
      providerCapability: ProviderCapability.KNOWLEDGE,
    };
  }

  createHandoffEnvelope(title: string): HandoffEnvelope {
    const now = createTimestamp();

    return {
      id: createUlid(),
      status: HandoffStatus.DRAFT,
      title,
      createdAt: now,
      updatedAt: now,
    };
  }

  advanceHandoff(envelope: HandoffEnvelope, to: HandoffStatus): HandoffEnvelope {
    assertValidHandoffTransition(envelope.status, to);

    return { ...envelope, status: to, updatedAt: createTimestamp() };
  }

  createWorkspaceConfig(name: string): WorkspaceConfig {
    return {
      id: WorkspaceIdSchema.parse(createUlid()),
      name,
      createdAt: createTimestamp(),
      providers: new Map(),
    };
  }
}

@Module({
  providers: [KnowledgeAndHandoffFactoryService],
  exports: [KnowledgeAndHandoffFactoryService],
})
class FactoryModule {}

describe('shared primitives composed through a NestJS provider (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: KnowledgeAndHandoffFactoryService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [FactoryModule],
    }).compile();

    factory = moduleRef.get(KnowledgeAndHandoffFactoryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('builds a KnowledgeArtifact via the injected factory that validates against its schema', () => {
    const artifact = factory.createKnowledgeArtifact(
      'https://example.com/doc',
      'hello world',
    );

    const parsed = KnowledgeArtifactSchema.parse(artifact);

    expect(parsed.id).toBe(artifact.id);
    expect(parsed.contentHash).toBe(createContentHash('hello world'));
  });

  it('builds a HandoffEnvelope via the injected factory that validates against its schema', () => {
    const envelope = factory.createHandoffEnvelope('Wire up shared primitives');

    expect(() => HandoffEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it('advances a handoff through a legal FSM transition end-to-end', () => {
    const draft = factory.createHandoffEnvelope('Wire up shared primitives');

    const ready = factory.advanceHandoff(draft, HandoffStatus.READY);

    expect(HandoffEnvelopeSchema.parse(ready).status).toBe(HandoffStatus.READY);
    expect(ready.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
  });

  it('rejects an illegal handoff transition raised by the injected factory', () => {
    const draft = factory.createHandoffEnvelope('Wire up shared primitives');

    expect(() => factory.advanceHandoff(draft, HandoffStatus.DONE)).toThrow(
      /Invalid handoff transition/,
    );
  });

  it('builds a WorkspaceConfig via the injected factory that validates against its schema', () => {
    const config = factory.createWorkspaceConfig('Sample workspace');

    const parsed = WorkspaceConfigSchema.parse(config);

    expect(parsed.name).toBe('Sample workspace');
    expect(parsed.providers.size).toBe(0);
  });

  it('rejects a KnowledgeArtifact whose content hash does not match its schema pattern', () => {
    const artifact = factory.createKnowledgeArtifact(
      'https://example.com/doc',
      'hello world',
    );

    const tampered = { ...artifact, contentHash: 'not-a-valid-hash' };

    expect(() => KnowledgeArtifactSchema.parse(tampered)).toThrow();
  });
});
