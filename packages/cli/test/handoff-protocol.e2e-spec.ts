import { Test, TestingModule } from '@nestjs/testing';
import { HandoffStatus } from '../src/shared/handoff.types.js';
import { ProviderCapability } from '../src/shared/provider.types.js';
import { UlidSchema } from '../src/shared/primitives.js';
import {
  HandoffDependencyType,
  HandoffProtocolEnvelopeSchema,
  HandoffProtocolModule,
  HandoffProtocolFactory,
  HandoffSerializationError,
  HandoffTransitionError,
  HandoffValidationError,
} from '../src/handoff/index.js';
import type {
  CreateHandoffProtocolEnvelopeInput,
  HandoffProtocolEnvelope,
} from '../src/handoff/index.js';

/** Baseline required input, reused and overridden by individual tests. */
function baseInput(): CreateHandoffProtocolEnvelopeInput {
  return {
    title: 'Implement handoff envelope schema',
    source: {
      providerType: ProviderCapability.ISSUE,
      providerId: 'github-issues',
      sourceRef: 'H09',
      sourceUrl: 'https://example.com/issues/H09',
    },
    objective:
      'Define the machine-readable handoff envelope format for Virgil agent phases.',
    repoTargets: {
      workspaceId: 'virgil-workspace',
      packages: ['@virgil/cli'],
      branch: 'development',
    },
  };
}

describe('Handoff Protocol (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: HandoffProtocolFactory;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [HandoffProtocolModule],
    }).compile();

    factory = moduleRef.get(HandoffProtocolFactory);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('DI wiring', () => {
    it('resolves HandoffProtocolFactory through the NestJS container', () => {
      expect(factory).toBeInstanceOf(HandoffProtocolFactory);
    });
  });

  describe('envelope construction (D1, D7)', () => {
    it('builds a valid draft envelope from required fields with defaulted optionals', () => {
      const envelope = factory.create(baseInput());

      expect(envelope.status).toBe(HandoffStatus.DRAFT);
      expect(envelope.title).toBe('Implement handoff envelope schema');
      expect(envelope.acceptanceCriteria).toEqual([]);
      expect(envelope.constraints).toEqual([]);
      expect(envelope.components).toEqual([]);
      expect(envelope.architecturalContext).toEqual([]);
      expect(envelope.dependencies).toEqual([]);
      expect(envelope.risks).toEqual([]);
      expect(envelope.unresolvedQuestions).toEqual([]);
      expect(envelope.provenanceRefs).toEqual([]);
      expect(envelope.ragQueryHints).toEqual([]);
      expect(envelope.verificationRequirements.evidenceRequired).toEqual([]);
      expect(envelope.createdAt).toBe(envelope.updatedAt);
      expect(() => HandoffProtocolEnvelopeSchema.parse(envelope)).not.toThrow();
    });

    it('populates progressively supplied optional fields (D1 full field set)', () => {
      const envelope = factory.create({
        ...baseInput(),
        partial: {
          acceptanceCriteria: [
            { id: 'AC1', description: 'Schema exists', verified: false },
          ],
          constraints: ['Must use Zod 4.5.4'],
          components: [
            { path: 'src/handoff/', description: 'Protocol module' },
          ],
          architecturalContext: [
            {
              domain: 'handoff-protocol',
              description: 'Extends shared FSM',
              references: ['src/shared/handoff.types.ts'],
            },
          ],
          dependencies: [
            {
              type: HandoffDependencyType.HANDOFF,
              id: 'H01',
              description: 'Repository bootstrap',
            },
          ],
          risks: [
            { description: 'Schema coupling', mitigation: 'Isolated module' },
          ],
          unresolvedQuestions: ['Should provider types narrow further?'],
          provenanceRefs: [
            {
              provider: ProviderCapability.KNOWLEDGE,
              sourceId: 'doc-123',
              discoveredAt: Date.now(),
            },
          ],
          ragQueryHints: [{ query: 'handoff envelope schema', maxResults: 5 }],
          verificationRequirements: {
            staticGates: ['lint', 'typescript'],
            dynamicGates: ['vitest'],
            evidenceRequired: ['terminal-output'],
          },
        },
      });

      const parsed = HandoffProtocolEnvelopeSchema.parse(envelope);

      expect(parsed.acceptanceCriteria).toHaveLength(1);
      expect(parsed.dependencies[0]?.type).toBe(HandoffDependencyType.HANDOFF);
      expect(parsed.verificationRequirements.staticGates).toEqual([
        'lint',
        'typescript',
      ]);
      expect(parsed.provenanceRefs[0]?.provider).toBe(
        ProviderCapability.KNOWLEDGE,
      );
    });

    it('rejects schema validation via the factory when constructing with invalid nested input', () => {
      const invalidInput = {
        ...baseInput(),
        repoTargets: { packages: [] },
      } as unknown as CreateHandoffProtocolEnvelopeInput;

      expect(() => factory.create(invalidInput)).toThrow(
        HandoffValidationError,
      );
    });
  });

  describe('status lifecycle transitions (D2)', () => {
    it('drives the full lifecycle flow: draft -> ready -> assigned -> in_progress -> review -> done -> archived', () => {
      let envelope: HandoffProtocolEnvelope = factory.create(baseInput());
      expect(envelope.status).toBe(HandoffStatus.DRAFT);

      envelope = factory.transition(envelope, HandoffStatus.READY);
      expect(envelope.status).toBe(HandoffStatus.READY);

      envelope = factory.transition(envelope, HandoffStatus.ASSIGNED);
      expect(envelope.status).toBe(HandoffStatus.ASSIGNED);

      envelope = factory.transition(envelope, HandoffStatus.IN_PROGRESS);
      expect(envelope.status).toBe(HandoffStatus.IN_PROGRESS);

      envelope = factory.transition(envelope, HandoffStatus.REVIEW);
      expect(envelope.status).toBe(HandoffStatus.REVIEW);

      envelope = factory.transition(envelope, HandoffStatus.DONE);
      expect(envelope.status).toBe(HandoffStatus.DONE);

      envelope = factory.transition(envelope, HandoffStatus.ARCHIVED);
      expect(envelope.status).toBe(HandoffStatus.ARCHIVED);
    });

    it('re-stamps updatedAt on a successful transition', async () => {
      const draft = factory.create(baseInput());
      await new Promise((resolve) => setTimeout(resolve, 2));

      const ready = factory.transition(draft, HandoffStatus.READY);

      expect(ready.updatedAt).toBeGreaterThan(draft.updatedAt);
    });

    it('supports the rejected-rework loop: review -> in_progress', () => {
      let envelope = factory.create(baseInput());
      envelope = factory.transition(envelope, HandoffStatus.READY);
      envelope = factory.transition(envelope, HandoffStatus.ASSIGNED);
      envelope = factory.transition(envelope, HandoffStatus.IN_PROGRESS);
      envelope = factory.transition(envelope, HandoffStatus.REVIEW);

      const reworked = factory.transition(envelope, HandoffStatus.IN_PROGRESS);

      expect(reworked.status).toBe(HandoffStatus.IN_PROGRESS);
    });

    it('throws HandoffTransitionError with current, attempted, and valid targets for an illegal transition', () => {
      const draft = factory.create(baseInput());

      let caught: unknown;
      try {
        factory.transition(draft, HandoffStatus.DONE);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(HandoffTransitionError);
      const error = caught as HandoffTransitionError;
      expect(error.current).toBe(HandoffStatus.DRAFT);
      expect(error.attempted).toBe(HandoffStatus.DONE);
      expect(error.validTargets).toEqual([HandoffStatus.READY]);
      expect(error.message).toMatch(/Illegal handoff transition/);
    });

    it('throws HandoffTransitionError with an empty valid-target set from the terminal ARCHIVED state', () => {
      let envelope = factory.create(baseInput());
      envelope = factory.transition(envelope, HandoffStatus.READY);
      envelope = factory.transition(envelope, HandoffStatus.ASSIGNED);
      envelope = factory.transition(envelope, HandoffStatus.IN_PROGRESS);
      envelope = factory.transition(envelope, HandoffStatus.REVIEW);
      envelope = factory.transition(envelope, HandoffStatus.DONE);
      envelope = factory.transition(envelope, HandoffStatus.ARCHIVED);

      expect(() => factory.transition(envelope, HandoffStatus.DRAFT)).toThrow(
        HandoffTransitionError,
      );
    });
  });

  describe('JSON serialization round-trip (D8)', () => {
    it('produces a deeply equal envelope for a required-fields-only envelope', () => {
      const envelope = factory.create(baseInput());

      const roundTripped = factory.deserialize(factory.serialize(envelope));

      expect(roundTripped).toEqual(envelope);
    });

    it('produces a deeply equal envelope for a fully populated envelope', () => {
      const envelope = factory.create({
        ...baseInput(),
        parentId: UlidSchema.parse('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
        partial: {
          acceptanceCriteria: [
            { id: 'AC1', description: 'Schema exists', verified: true },
          ],
          constraints: ['Must use Zod 4.5.4'],
          components: [{ path: 'src/handoff/' }],
          architecturalContext: [
            { domain: 'handoff-protocol', description: 'Extends shared FSM' },
          ],
          dependencies: [
            {
              type: HandoffDependencyType.EXTERNAL,
              id: 'ext-1',
              description: 'n/a',
            },
          ],
          risks: [{ description: 'Coupling risk' }],
          unresolvedQuestions: ['Open question'],
          provenanceRefs: [
            {
              provider: ProviderCapability.KNOWLEDGE,
              sourceId: 'doc-123',
              discoveredAt: Date.now(),
              refreshedAt: Date.now(),
              version: 'v1',
              uri: '/docs/doc-123.md',
            },
          ],
          ragQueryHints: [
            {
              query: 'handoff envelope schema',
              topicKeys: ['handoff', 'protocol'],
              providers: [ProviderCapability.KNOWLEDGE],
              maxResults: 5,
              relevanceNote: 'Primary reference',
            },
          ],
          verificationRequirements: {
            staticGates: ['lint'],
            dynamicGates: ['vitest'],
            coverageThreshold: { statements: 97, lines: 97 },
            specificAssertions: ['Round trip proven'],
            evidenceRequired: ['terminal-output', 'coverage-summary'],
          },
        },
      });

      const roundTripped = factory.deserialize(factory.serialize(envelope));

      expect(roundTripped).toEqual(envelope);
    });

    it('produces a deeply equal envelope across a full lifecycle transition and edge-case empty-array values', () => {
      let envelope = factory.create(baseInput());
      envelope = factory.transition(envelope, HandoffStatus.READY);

      const roundTripped = factory.deserialize(factory.serialize(envelope));

      expect(roundTripped).toEqual(envelope);
      expect(roundTripped.status).toBe(HandoffStatus.READY);
    });

    it('throws HandoffSerializationError for malformed JSON input', () => {
      expect(() => factory.deserialize('{not valid json')).toThrow(
        HandoffSerializationError,
      );
    });

    it('throws HandoffValidationError for well-formed JSON that violates the schema', () => {
      expect(() => factory.deserialize(JSON.stringify({ foo: 'bar' }))).toThrow(
        HandoffValidationError,
      );
    });
  });

  describe('exclusion validation (D6)', () => {
    it('rejects an envelope whose objective contains a Bearer token', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          objective: 'Use Bearer abcdef1234567890ghijklmnop to call the API',
        }),
      ).toThrow(HandoffValidationError);
    });

    it('rejects an envelope whose constraint contains an AWS access key id', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          partial: { constraints: ['Key is AKIAABCDEFGHIJKLMNOP'] },
        }),
      ).toThrow(HandoffValidationError);
    });

    it('rejects an envelope whose risk description contains a password assignment', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          partial: {
            risks: [{ description: 'password: hunter2-supersecret-value' }],
          },
        }),
      ).toThrow(HandoffValidationError);
    });

    it('rejects an envelope whose source URL embeds credentials', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          source: {
            ...baseInput().source,
            sourceUrl: 'https://user:hunter2pass@example.com/issues/H09',
          },
        }),
      ).toThrow(HandoffValidationError);
    });

    it('surfaces the field path and reason on the thrown validation error for a credential pattern', () => {
      let caught: unknown;
      try {
        factory.create({
          ...baseInput(),
          partial: {
            unresolvedQuestions: [
              'token=abcdefghijklmnopqrstuvwx should rotate?',
            ],
          },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(HandoffValidationError);
      const error = caught as HandoffValidationError;
      expect(error.issues.length).toBeGreaterThan(0);
      expect(error.issues[0]?.path).toContain('unresolvedQuestions');
    });

    it('does not flag ordinary prose that merely mentions "token" without an assignment', () => {
      const envelope = factory.create({
        ...baseInput(),
        objective: 'Refresh the access token rotation policy documentation.',
      });

      expect(envelope.objective).toContain('token');
    });

    it('rejects an envelope whose objective exceeds the default maximum length', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          objective: 'x'.repeat(4097),
        }),
      ).toThrow(HandoffValidationError);
    });

    it('rejects an envelope whose acceptance criterion description exceeds the default maximum length', () => {
      expect(() =>
        factory.create({
          ...baseInput(),
          partial: {
            acceptanceCriteria: [
              { id: 'AC1', description: 'y'.repeat(2049), verified: false },
            ],
          },
        }),
      ).toThrow(HandoffValidationError);
    });

    it('rejects an envelope carrying an unknown field (no catch-all additionalProperties)', () => {
      const envelope = factory.create(baseInput());

      expect(() =>
        HandoffProtocolEnvelopeSchema.parse({
          ...envelope,
          chatHistory: [{ role: 'user', content: 'raw transcript dump' }],
        }),
      ).toThrow();
    });

    it('rejects an envelope missing a required field', () => {
      const envelope = factory.create(baseInput());
      const withoutObjective: Record<string, unknown> = { ...envelope };
      delete withoutObjective.objective;

      expect(() =>
        HandoffProtocolEnvelopeSchema.parse(withoutObjective),
      ).toThrow();
    });
  });

  describe('validate() as a general-purpose guard', () => {
    it('accepts a value that already satisfies the schema', () => {
      const envelope = factory.create(baseInput());

      expect(factory.validate(JSON.parse(JSON.stringify(envelope)))).toEqual(
        envelope,
      );
    });

    it('rejects a non-object candidate', () => {
      expect(() => factory.validate('not an envelope')).toThrow(
        HandoffValidationError,
      );
    });
  });
});
