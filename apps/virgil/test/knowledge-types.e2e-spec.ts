import {
  KnowledgeArtifactSchema,
  ProvenanceRecordSchema,
} from '../src/shared/knowledge.types.js';

describe('knowledge types', () => {
  const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const validHash = 'a'.repeat(64);
  const validTimestamp = 1_700_000_000_000;

  describe('KnowledgeArtifactSchema', () => {
    const validArtifact = {
      id: validUlid,
      contentHash: validHash,
      sourceUri: 'https://example.com/doc',
      mimeType: 'text/markdown',
      title: 'Example Document',
      createdAt: validTimestamp,
      updatedAt: validTimestamp,
      providerId: 'github',
      providerCapability: 'knowledge',
    };

    it('accepts a valid artifact', () => {
      const result = KnowledgeArtifactSchema.safeParse(validArtifact);
      expect(result.success).toBe(true);
    });

    it('rejects an artifact with an empty title', () => {
      const result = KnowledgeArtifactSchema.safeParse({
        ...validArtifact,
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an artifact with an empty sourceUri', () => {
      const result = KnowledgeArtifactSchema.safeParse({
        ...validArtifact,
        sourceUri: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an artifact with an invalid providerCapability', () => {
      const result = KnowledgeArtifactSchema.safeParse({
        ...validArtifact,
        providerCapability: 'nonexistent',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an artifact with an invalid content hash', () => {
      const result = KnowledgeArtifactSchema.safeParse({
        ...validArtifact,
        contentHash: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an artifact with a missing field', () => {
      const { mimeType: _, ...partial } = validArtifact;
      const result = KnowledgeArtifactSchema.safeParse(partial);
      expect(result.success).toBe(false);
    });
  });

  describe('ProvenanceRecordSchema', () => {
    const validRecord = {
      id: validUlid,
      artifactId: validUlid,
      sourceUri: 'https://example.com/doc',
      fetchedAt: validTimestamp,
      fetchedBy: 'github-crawler',
      contentHashAtFetch: validHash,
    };

    it('accepts a valid provenance record', () => {
      const result = ProvenanceRecordSchema.safeParse(validRecord);
      expect(result.success).toBe(true);
    });

    it('rejects a record with an empty fetchedBy', () => {
      const result = ProvenanceRecordSchema.safeParse({
        ...validRecord,
        fetchedBy: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a record with an invalid artifactId', () => {
      const result = ProvenanceRecordSchema.safeParse({
        ...validRecord,
        artifactId: 'not-a-ulid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a record with a negative timestamp', () => {
      const result = ProvenanceRecordSchema.safeParse({
        ...validRecord,
        fetchedAt: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a record with an empty sourceUri', () => {
      const result = ProvenanceRecordSchema.safeParse({
        ...validRecord,
        sourceUri: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
