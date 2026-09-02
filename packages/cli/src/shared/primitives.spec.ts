import { createHash } from 'node:crypto';
import {
  ContentHashSchema,
  SemVerSchema,
  TimestampSchema,
  UlidSchema,
  createContentHash,
  createTimestamp,
  createUlid,
} from './primitives.js';

describe('createUlid', () => {
  it('generates a value that satisfies UlidSchema', () => {
    const id = createUlid();

    expect(UlidSchema.safeParse(id).success).toBe(true);
  });

  it('generates lexicographically distinct values', () => {
    expect(createUlid()).not.toBe(createUlid());
  });
});

describe('createTimestamp', () => {
  it('captures the current instant as milliseconds since epoch', () => {
    const before = Date.now();
    const timestamp = createTimestamp();
    const after = Date.now();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('createContentHash', () => {
  it('matches the SHA-256 hex digest of the given content', () => {
    const content = 'virgil';
    const expected = createHash('sha256')
      .update(content, 'utf-8')
      .digest('hex');

    expect(createContentHash(content)).toBe(expected);
  });

  it('satisfies ContentHashSchema', () => {
    expect(ContentHashSchema.safeParse(createContentHash('abc')).success).toBe(
      true,
    );
  });
});

describe('UlidSchema', () => {
  it('accepts a well-formed ULID', () => {
    expect(UlidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(
      true,
    );
  });

  it('rejects a malformed ULID', () => {
    expect(UlidSchema.safeParse('not-a-ulid').success).toBe(false);
  });
});

describe('ContentHashSchema', () => {
  it('accepts a well-formed SHA-256 hex digest', () => {
    const digest = createHash('sha256').update('virgil').digest('hex');

    expect(ContentHashSchema.safeParse(digest).success).toBe(true);
  });

  it('rejects a value that is not a 64-char hex digest', () => {
    expect(ContentHashSchema.safeParse('deadbeef').success).toBe(false);
  });
});

describe('TimestampSchema', () => {
  it('accepts a non-negative integer', () => {
    expect(TimestampSchema.safeParse(1_700_000_000_000).success).toBe(true);
  });

  it('rejects a negative number', () => {
    expect(TimestampSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects a non-integer number', () => {
    expect(TimestampSchema.safeParse(1.5).success).toBe(false);
  });
});

describe('SemVerSchema', () => {
  it('accepts a well-formed semantic version', () => {
    expect(SemVerSchema.safeParse('1.2.3').success).toBe(true);
  });

  it('accepts a semantic version with prerelease and build metadata', () => {
    expect(SemVerSchema.safeParse('1.2.3-rc.1+build.5').success).toBe(true);
  });

  it('rejects a malformed semantic version', () => {
    expect(SemVerSchema.safeParse('1.2').success).toBe(false);
  });
});
