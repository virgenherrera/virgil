import {
  createContentHash,
  createTimestamp,
  createUlid,
} from './primitives.js';
import { ProviderCapability } from './provider.types.js';
import {
  KnowledgeArtifactSchema,
  ProvenanceRecordSchema,
} from './knowledge.types.js';

describe('KnowledgeArtifactSchema', () => {
  const valid = {
    id: createUlid(),
    contentHash: createContentHash('virgil-doc'),
    sourceUri: 'https://example.com/doc',
    mimeType: 'text/markdown',
    title: 'Architecture overview',
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    providerId: 'confluence',
    providerCapability: ProviderCapability.KNOWLEDGE,
  };

  it('accepts a valid knowledge artifact', () => {
    expect(KnowledgeArtifactSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid content hash', () => {
    const result = KnowledgeArtifactSchema.safeParse({
      ...valid,
      contentHash: 'not-a-hash',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty mime type', () => {
    expect(
      KnowledgeArtifactSchema.safeParse({ ...valid, mimeType: '' }).success,
    ).toBe(false);
  });
});

describe('ProvenanceRecordSchema', () => {
  const valid = {
    id: createUlid(),
    artifactId: createUlid(),
    sourceUri: 'https://example.com/doc',
    fetchedAt: createTimestamp(),
    fetchedBy: 'confluence',
    contentHashAtFetch: createContentHash('virgil-doc'),
  };

  it('accepts a valid provenance record', () => {
    expect(ProvenanceRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty fetchedBy', () => {
    expect(
      ProvenanceRecordSchema.safeParse({ ...valid, fetchedBy: '' }).success,
    ).toBe(false);
  });

  it('rejects a malformed artifactId', () => {
    const result = ProvenanceRecordSchema.safeParse({
      ...valid,
      artifactId: 'not-a-ulid',
    });

    expect(result.success).toBe(false);
  });
});
