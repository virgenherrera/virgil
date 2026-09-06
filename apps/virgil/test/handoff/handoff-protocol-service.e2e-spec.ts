import { HandoffStatus } from '../../src/shared/handoff.types.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';
import { HandoffProtocolFactory } from '../../src/handoff/handoff-protocol.service.js';
import type { CreateHandoffProtocolEnvelopeInput } from '../../src/handoff/handoff-protocol.service.js';
import { HandoffValidationError } from '../../src/handoff/handoff-protocol.errors.js';
import { HandoffTransitionError } from '../../src/handoff/handoff-protocol.errors.js';
import { HandoffSerializationError } from '../../src/handoff/handoff-protocol.errors.js';

function makeInput(
  overrides?: Partial<CreateHandoffProtocolEnvelopeInput>,
): CreateHandoffProtocolEnvelopeInput {
  return {
    title: 'Test handoff',
    source: {
      providerType: ProviderCapability.KNOWLEDGE,
      providerId: 'provider-1',
      sourceRef: 'ref-1',
    },
    objective: 'Build feature X',
    repoTargets: {
      workspaceId: 'ws-1',
      packages: ['@virgil/core'],
    },
    ...overrides,
  };
}

describe('HandoffProtocolFactory', () => {
  let factory: HandoffProtocolFactory;

  beforeEach(() => {
    factory = new HandoffProtocolFactory();
  });

  describe('create', () => {
    it('auto-generates id and timestamps', () => {
      const envelope = factory.create(makeInput());
      expect(envelope.id).toBeDefined();
      expect(typeof envelope.id).toBe('string');
      expect(envelope.id.length).toBe(26);
      expect(envelope.createdAt).toBeGreaterThan(0);
      expect(envelope.updatedAt).toBe(envelope.createdAt);
    });

    it('defaults status to DRAFT', () => {
      const envelope = factory.create(makeInput());
      expect(envelope.status).toBe(HandoffStatus.DRAFT);
    });

    it('sets title and objective from input', () => {
      const envelope = factory.create(
        makeInput({ title: 'My title', objective: 'My objective' }),
      );
      expect(envelope.title).toBe('My title');
      expect(envelope.objective).toBe('My objective');
    });

    it('includes parentId when provided', () => {
      const parentId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      const envelope = factory.create(
        makeInput({ parentId: parentId as never }),
      );
      expect(envelope.parentId).toBe(parentId);
    });

    it('does not include parentId when omitted', () => {
      const envelope = factory.create(makeInput());
      expect(envelope.parentId).toBeUndefined();
    });

    it('accepts partial optional fields', () => {
      const envelope = factory.create(
        makeInput({
          partial: {
            constraints: ['No external deps'],
            risks: [{ description: 'Breaking change' }],
          },
        }),
      );
      expect(envelope.constraints).toEqual(['No external deps']);
      expect(envelope.risks).toHaveLength(1);
    });

    it('defaults array fields to empty when partial is omitted', () => {
      const envelope = factory.create(makeInput());
      expect(envelope.acceptanceCriteria).toEqual([]);
      expect(envelope.constraints).toEqual([]);
      expect(envelope.components).toEqual([]);
      expect(envelope.architecturalContext).toEqual([]);
      expect(envelope.dependencies).toEqual([]);
      expect(envelope.risks).toEqual([]);
      expect(envelope.unresolvedQuestions).toEqual([]);
      expect(envelope.provenanceRefs).toEqual([]);
      expect(envelope.ragQueryHints).toEqual([]);
    });

    it('defaults verificationRequirements with empty evidenceRequired', () => {
      const envelope = factory.create(makeInput());
      expect(envelope.verificationRequirements.evidenceRequired).toEqual([]);
    });

    it('throws HandoffValidationError for a credential in objective', () => {
      expect(() =>
        factory.create(
          makeInput({ objective: 'Use bearer eyJhbGciOiJIUzI1NiJ9' }),
        ),
      ).toThrow(HandoffValidationError);
    });

    it('throws HandoffValidationError for an empty title', () => {
      expect(() => factory.create(makeInput({ title: '' }))).toThrow(
        HandoffValidationError,
      );
    });
  });

  describe('validate', () => {
    it('returns a valid envelope unchanged', () => {
      const created = factory.create(makeInput());
      const validated = factory.validate(created);
      expect(validated).toEqual(created);
    });

    it('throws HandoffValidationError for an invalid candidate', () => {
      expect(() => factory.validate({ bad: 'data' })).toThrow(
        HandoffValidationError,
      );
    });

    it('throws HandoffValidationError with issues array', () => {
      try {
        factory.validate({ bad: 'data' });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HandoffValidationError);
        expect((error as HandoffValidationError).issues.length).toBeGreaterThan(
          0,
        );
      }
    });
  });

  describe('transition', () => {
    it('transitions DRAFT -> READY', () => {
      const draft = factory.create(makeInput());
      const ready = factory.transition(draft, HandoffStatus.READY);
      expect(ready.status).toBe(HandoffStatus.READY);
    });

    it('re-stamps updatedAt on transition', () => {
      const draft = factory.create(makeInput());
      const ready = factory.transition(draft, HandoffStatus.READY);
      expect(ready.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
    });

    it('preserves other fields on transition', () => {
      const draft = factory.create(makeInput());
      const ready = factory.transition(draft, HandoffStatus.READY);
      expect(ready.id).toBe(draft.id);
      expect(ready.title).toBe(draft.title);
      expect(ready.createdAt).toBe(draft.createdAt);
    });

    it('throws HandoffTransitionError for an illegal transition', () => {
      const draft = factory.create(makeInput());
      expect(() => factory.transition(draft, HandoffStatus.DONE)).toThrow(
        HandoffTransitionError,
      );
    });

    it('HandoffTransitionError carries current, attempted, validTargets', () => {
      const draft = factory.create(makeInput());
      try {
        factory.transition(draft, HandoffStatus.DONE);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HandoffTransitionError);
        const te = error as HandoffTransitionError;
        expect(te.current).toBe(HandoffStatus.DRAFT);
        expect(te.attempted).toBe(HandoffStatus.DONE);
        expect(te.validTargets).toContain(HandoffStatus.READY);
      }
    });

    it('supports multi-step transitions through the FSM', () => {
      let envelope = factory.create(makeInput());
      envelope = factory.transition(envelope, HandoffStatus.READY);
      envelope = factory.transition(envelope, HandoffStatus.ASSIGNED);
      envelope = factory.transition(envelope, HandoffStatus.IN_PROGRESS);
      envelope = factory.transition(envelope, HandoffStatus.REVIEW);
      envelope = factory.transition(envelope, HandoffStatus.DONE);
      envelope = factory.transition(envelope, HandoffStatus.ARCHIVED);
      expect(envelope.status).toBe(HandoffStatus.ARCHIVED);
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trips an envelope', () => {
      const original = factory.create(makeInput());
      const json = factory.serialize(original);
      const restored = factory.deserialize(json);
      expect(restored).toEqual(original);
    });

    it('serialize produces valid JSON', () => {
      const envelope = factory.create(makeInput());
      const json = factory.serialize(envelope);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('deserialize throws HandoffSerializationError for invalid JSON', () => {
      expect(() => factory.deserialize('not-json')).toThrow(
        HandoffSerializationError,
      );
    });

    it('deserialize throws HandoffValidationError for valid JSON with wrong shape', () => {
      expect(() => factory.deserialize('{"bad":"data"}')).toThrow(
        HandoffValidationError,
      );
    });

    it('HandoffSerializationError carries the original cause', () => {
      try {
        factory.deserialize('{broken');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HandoffSerializationError);
        expect((error as HandoffSerializationError).cause).toBeDefined();
      }
    });
  });
});
