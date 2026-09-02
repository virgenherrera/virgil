import { createTimestamp, createUlid } from './primitives.js';
import {
  HANDOFF_TRANSITIONS,
  HandoffEnvelopeSchema,
  HandoffStatus,
  assertValidHandoffTransition,
  isValidHandoffTransition,
} from './handoff.types.js';

describe('HANDOFF_TRANSITIONS', () => {
  it('has an entry for every status', () => {
    const statuses = Object.values(HandoffStatus);

    for (const status of statuses) {
      expect(HANDOFF_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('leaves ARCHIVED as a terminal state', () => {
    expect(HANDOFF_TRANSITIONS[HandoffStatus.ARCHIVED]).toEqual([]);
  });
});

describe('isValidHandoffTransition', () => {
  it('returns true for a legal transition', () => {
    expect(
      isValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.READY),
    ).toBe(true);
  });

  it('returns false for an illegal transition', () => {
    expect(
      isValidHandoffTransition(HandoffStatus.DRAFT, HandoffStatus.DONE),
    ).toBe(false);
  });
});

describe('assertValidHandoffTransition', () => {
  it('does not throw for a legal transition', () => {
    expect(() =>
      assertValidHandoffTransition(HandoffStatus.READY, HandoffStatus.ASSIGNED),
    ).not.toThrow();
  });

  it('throws for an illegal transition', () => {
    expect(() =>
      assertValidHandoffTransition(HandoffStatus.ARCHIVED, HandoffStatus.DRAFT),
    ).toThrow('Invalid handoff transition: archived -> draft');
  });
});

describe('HandoffEnvelopeSchema', () => {
  const base = {
    id: createUlid(),
    status: HandoffStatus.DRAFT,
    title: 'Wire up shared contracts',
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
  };

  it('accepts a valid envelope without a parent', () => {
    expect(HandoffEnvelopeSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a valid envelope with a parent', () => {
    const result = HandoffEnvelopeSchema.safeParse({
      ...base,
      parentId: createUlid(),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(
      HandoffEnvelopeSchema.safeParse({ ...base, title: '' }).success,
    ).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = HandoffEnvelopeSchema.safeParse({
      ...base,
      status: 'unknown',
    });

    expect(result.success).toBe(false);
  });
});
