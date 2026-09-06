import {
  HandoffStatus,
  HANDOFF_TRANSITIONS,
  isValidHandoffTransition,
  assertValidHandoffTransition,
  HandoffEnvelopeSchema,
} from '../src/shared/handoff.types.js';

describe('handoff types', () => {
  describe('HandoffStatus', () => {
    it('exposes all expected status values', () => {
      expect(HandoffStatus.DRAFT).toBe('draft');
      expect(HandoffStatus.READY).toBe('ready');
      expect(HandoffStatus.ASSIGNED).toBe('assigned');
      expect(HandoffStatus.IN_PROGRESS).toBe('in_progress');
      expect(HandoffStatus.BLOCKED).toBe('blocked');
      expect(HandoffStatus.REVIEW).toBe('review');
      expect(HandoffStatus.DONE).toBe('done');
      expect(HandoffStatus.ARCHIVED).toBe('archived');
    });
  });

  describe('HANDOFF_TRANSITIONS', () => {
    it('allows DRAFT -> READY', () => {
      expect(HANDOFF_TRANSITIONS[HandoffStatus.DRAFT]).toContain(
        HandoffStatus.READY,
      );
    });

    it('allows READY -> ASSIGNED', () => {
      expect(HANDOFF_TRANSITIONS[HandoffStatus.READY]).toContain(
        HandoffStatus.ASSIGNED,
      );
    });

    it('allows bidirectional READY <-> DRAFT', () => {
      expect(HANDOFF_TRANSITIONS[HandoffStatus.READY]).toContain(
        HandoffStatus.DRAFT,
      );
    });

    it('blocks DRAFT -> DONE', () => {
      expect(HANDOFF_TRANSITIONS[HandoffStatus.DRAFT]).not.toContain(
        HandoffStatus.DONE,
      );
    });

    it('has no outgoing transitions from ARCHIVED', () => {
      expect(HANDOFF_TRANSITIONS[HandoffStatus.ARCHIVED]).toHaveLength(0);
    });

    it('covers every status as a key', () => {
      const statuses = Object.values(HandoffStatus);
      for (const status of statuses) {
        expect(HANDOFF_TRANSITIONS).toHaveProperty(status);
      }
    });
  });

  describe('isValidHandoffTransition', () => {
    it('returns true for a valid transition', () => {
      expect(
        isValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.READY),
      ).toBe(true);
    });

    it('returns false for an invalid transition', () => {
      expect(
        isValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.DONE),
      ).toBe(false);
    });
  });

  describe('assertValidHandoffTransition', () => {
    it('does not throw for a valid transition', () => {
      expect(() =>
        assertValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.READY),
      ).not.toThrow();
    });

    it('throws for an invalid transition', () => {
      expect(() =>
        assertValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.DONE),
      ).toThrow('Invalid handoff transition: draft -> done');
    });
  });

  describe('HandoffEnvelopeSchema', () => {
    const validEnvelope = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      status: 'draft',
      title: 'Test handoff',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };

    it('accepts a valid envelope', () => {
      const result = HandoffEnvelopeSchema.safeParse(validEnvelope);
      expect(result.success).toBe(true);
    });

    it('accepts a valid envelope with parentId', () => {
      const result = HandoffEnvelopeSchema.safeParse({
        ...validEnvelope,
        parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an envelope with an empty title', () => {
      const result = HandoffEnvelopeSchema.safeParse({
        ...validEnvelope,
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an envelope with an invalid status', () => {
      const result = HandoffEnvelopeSchema.safeParse({
        ...validEnvelope,
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an envelope with a missing id', () => {
      const { id: _, ...rest } = validEnvelope;
      const result = HandoffEnvelopeSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });
});
