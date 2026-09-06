import { ProviderCapability } from '../../src/shared/provider.types.js';
import {
  ProvenanceRefSchema,
  RagQueryHintSchema,
  CoverageThresholdSchema,
  VerificationRequirementsSchema,
  HandoffSourceSchema,
  AcceptanceCriterionSchema,
  RepoTargetsSchema,
  ComponentRefSchema,
  ArchitecturalContextEntrySchema,
  HandoffDependencySchema,
  HandoffDependencyType,
  HandoffRiskSchema,
  HandoffProtocolEnvelopeSchema,
  findExcludedContent,
} from '../../src/handoff/handoff-protocol.schema.js';

function makeValidEnvelope(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    status: 'draft',
    title: 'Implement feature X',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    source: {
      providerType: ProviderCapability.KNOWLEDGE,
      providerId: 'provider-1',
      sourceRef: 'ref-1',
    },
    objective: 'Build feature X with full test coverage',
    repoTargets: {
      workspaceId: 'ws-1',
      packages: ['@virgil/core'],
    },
    verificationRequirements: {
      evidenceRequired: [],
    },
    ...overrides,
  };
}

describe('handoff protocol schema', () => {
  describe('ProvenanceRefSchema', () => {
    it('accepts a minimal valid ref', () => {
      const result = ProvenanceRefSchema.safeParse({
        provider: ProviderCapability.KNOWLEDGE,
        sourceId: 'src-1',
        discoveredAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a fully populated ref', () => {
      const result = ProvenanceRefSchema.safeParse({
        provider: ProviderCapability.ISSUE,
        sourceId: 'src-2',
        uri: 'https://example.com/doc',
        contentHash:
          'a'.repeat(64).replace(/a/g, (_, i: number) =>
            '0123456789abcdef'[i % 16]),
        version: '1.0.0',
        discoveredAt: 1_700_000_000_000,
        refreshedAt: 1_700_000_001_000,
        taskAssociations: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty sourceId', () => {
      const result = ProvenanceRefSchema.safeParse({
        provider: ProviderCapability.KNOWLEDGE,
        sourceId: '',
        discoveredAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown properties (strict)', () => {
      const result = ProvenanceRefSchema.safeParse({
        provider: ProviderCapability.KNOWLEDGE,
        sourceId: 'src-1',
        discoveredAt: 1_700_000_000_000,
        extra: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RagQueryHintSchema', () => {
    it('accepts a minimal valid hint', () => {
      const result = RagQueryHintSchema.safeParse({
        query: 'How does X work?',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a fully populated hint', () => {
      const result = RagQueryHintSchema.safeParse({
        query: 'How does X work?',
        topicKeys: ['architecture'],
        providers: [ProviderCapability.RETRIEVER],
        maxResults: 5,
        relevanceNote: 'Focus on internal docs',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty query', () => {
      const result = RagQueryHintSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('CoverageThresholdSchema', () => {
    it('accepts partial thresholds', () => {
      const result = CoverageThresholdSchema.safeParse({
        statements: 80,
        lines: 90,
      });
      expect(result.success).toBe(true);
    });

    it('rejects values above 100', () => {
      const result = CoverageThresholdSchema.safeParse({ statements: 101 });
      expect(result.success).toBe(false);
    });

    it('rejects values below 0', () => {
      const result = CoverageThresholdSchema.safeParse({ branches: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('VerificationRequirementsSchema', () => {
    it('defaults evidenceRequired to empty array', () => {
      const result = VerificationRequirementsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidenceRequired).toEqual([]);
      }
    });

    it('accepts fully populated requirements', () => {
      const result = VerificationRequirementsSchema.safeParse({
        staticGates: ['lint', 'typecheck'],
        dynamicGates: ['test'],
        coverageThreshold: { statements: 95 },
        specificAssertions: ['No console.log'],
        evidenceRequired: ['screenshot'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('HandoffSourceSchema', () => {
    it('accepts a valid source', () => {
      const result = HandoffSourceSchema.safeParse({
        providerType: ProviderCapability.ISSUE,
        providerId: 'jira-1',
        sourceRef: 'PROJ-123',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a source with sourceUrl', () => {
      const result = HandoffSourceSchema.safeParse({
        providerType: ProviderCapability.ISSUE,
        providerId: 'jira-1',
        sourceRef: 'PROJ-123',
        sourceUrl: 'https://jira.example.com/PROJ-123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty providerId', () => {
      const result = HandoffSourceSchema.safeParse({
        providerType: ProviderCapability.ISSUE,
        providerId: '',
        sourceRef: 'ref',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AcceptanceCriterionSchema', () => {
    it('accepts a valid criterion and defaults verified to false', () => {
      const result = AcceptanceCriterionSchema.safeParse({
        id: 'ac-1',
        description: 'Must pass all tests',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verified).toBe(false);
      }
    });

    it('rejects a description exceeding max length', () => {
      const result = AcceptanceCriterionSchema.safeParse({
        id: 'ac-1',
        description: 'x'.repeat(2049),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RepoTargetsSchema', () => {
    it('accepts valid targets', () => {
      const result = RepoTargetsSchema.safeParse({
        workspaceId: 'ws-1',
        packages: ['@virgil/core'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty workspaceId', () => {
      const result = RepoTargetsSchema.safeParse({
        workspaceId: '',
        packages: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ComponentRefSchema', () => {
    it('accepts a minimal ref', () => {
      const result = ComponentRefSchema.safeParse({ path: 'src/core' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty path', () => {
      const result = ComponentRefSchema.safeParse({ path: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ArchitecturalContextEntrySchema', () => {
    it('accepts a valid entry', () => {
      const result = ArchitecturalContextEntrySchema.safeParse({
        domain: 'persistence',
        description: 'Uses SQLite via better-sqlite3',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty domain', () => {
      const result = ArchitecturalContextEntrySchema.safeParse({
        domain: '',
        description: 'valid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('HandoffDependencyType', () => {
    it('exposes HANDOFF, DELIVERABLE, EXTERNAL', () => {
      expect(HandoffDependencyType.HANDOFF).toBe('handoff');
      expect(HandoffDependencyType.DELIVERABLE).toBe('deliverable');
      expect(HandoffDependencyType.EXTERNAL).toBe('external');
    });
  });

  describe('HandoffDependencySchema', () => {
    it('accepts a valid dependency', () => {
      const result = HandoffDependencySchema.safeParse({
        type: HandoffDependencyType.HANDOFF,
        id: 'dep-1',
        description: 'Requires feature Y',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
      const result = HandoffDependencySchema.safeParse({
        type: HandoffDependencyType.EXTERNAL,
        id: '',
        description: 'valid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('HandoffRiskSchema', () => {
    it('accepts a risk with mitigation', () => {
      const result = HandoffRiskSchema.safeParse({
        description: 'May break API',
        mitigation: 'Add backwards compat layer',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a risk without mitigation', () => {
      const result = HandoffRiskSchema.safeParse({
        description: 'May break API',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty description', () => {
      const result = HandoffRiskSchema.safeParse({ description: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('HandoffProtocolEnvelopeSchema', () => {
    it('accepts a valid minimal envelope', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope(),
      );
      expect(result.success).toBe(true);
    });

    it('accepts an envelope with optional parentId', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
      );
      expect(result.success).toBe(true);
    });

    it('defaults array fields to empty arrays', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope(),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acceptanceCriteria).toEqual([]);
        expect(result.data.constraints).toEqual([]);
        expect(result.data.components).toEqual([]);
        expect(result.data.architecturalContext).toEqual([]);
        expect(result.data.dependencies).toEqual([]);
        expect(result.data.risks).toEqual([]);
        expect(result.data.unresolvedQuestions).toEqual([]);
        expect(result.data.provenanceRefs).toEqual([]);
        expect(result.data.ragQueryHints).toEqual([]);
      }
    });

    it('rejects an empty title', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ title: '' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects a title exceeding 200 characters', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ title: 'x'.repeat(201) }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an empty objective', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ objective: '' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an objective exceeding max length', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ objective: 'x'.repeat(4097) }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an invalid status', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ status: 'invalid' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects unknown properties (strict)', () => {
      const result = HandoffProtocolEnvelopeSchema.safeParse(
        makeValidEnvelope({ sneakyField: 'oops' }),
      );
      expect(result.success).toBe(false);
    });

    describe('D6 superRefine — credential exclusion', () => {
      it('rejects an envelope with a credential in the objective', () => {
        const result = HandoffProtocolEnvelopeSchema.safeParse(
          makeValidEnvelope({
            objective: 'Use bearer eyJhbGciOiJIUzI1NiJ9 for auth',
          }),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          const credentialIssue = result.error.issues.find(
            (i) => i.code === 'custom',
          );
          expect(credentialIssue).toBeDefined();
          expect(credentialIssue!.message).toContain('credential pattern');
        }
      });

      it('rejects an envelope with a credential in acceptanceCriteria', () => {
        const result = HandoffProtocolEnvelopeSchema.safeParse(
          makeValidEnvelope({
            acceptanceCriteria: [
              {
                id: 'ac-1',
                description: 'password=supersecretvalue123',
              },
            ],
          }),
        );
        expect(result.success).toBe(false);
      });

      it('passes when no credential patterns are present', () => {
        const result = HandoffProtocolEnvelopeSchema.safeParse(
          makeValidEnvelope(),
        );
        expect(result.success).toBe(true);
      });
    });
  });

  describe('findExcludedContent', () => {
    it('returns empty for clean strings', () => {
      expect(findExcludedContent('hello world')).toEqual([]);
    });

    it('returns a violation for a credential string', () => {
      const violations = findExcludedContent('bearer abc1234567890');
      expect(violations).toHaveLength(1);
      expect(violations[0].reason).toContain('credential pattern');
    });

    it('returns violations with paths for nested objects', () => {
      const violations = findExcludedContent({
        a: { b: 'bearer abc1234567890' },
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].path).toEqual(['a', 'b']);
    });

    it('returns violations with indices for arrays', () => {
      const violations = findExcludedContent(['safe', 'AKIAIOSFODNN7EXAMPLE']);
      expect(violations).toHaveLength(1);
      expect(violations[0].path).toEqual([1]);
    });

    it('returns empty for non-string/non-object/non-array values', () => {
      expect(findExcludedContent(42)).toEqual([]);
      expect(findExcludedContent(null)).toEqual([]);
      expect(findExcludedContent(undefined)).toEqual([]);
      expect(findExcludedContent(true)).toEqual([]);
    });
  });
});
