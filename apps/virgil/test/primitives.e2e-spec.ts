import {
  createUlid,
  createTimestamp,
  createContentHash,
  UlidSchema,
  ContentHashSchema,
  TimestampSchema,
  SemVerSchema,
} from '../src/shared/primitives.js';

describe('primitives', () => {
  describe('createUlid', () => {
    it('returns a valid ULID format', () => {
      const id = createUlid();
      expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    });

    it('returns unique values on successive calls', () => {
      const a = createUlid();
      const b = createUlid();
      expect(a).not.toBe(b);
    });
  });

  describe('createTimestamp', () => {
    it('returns a positive integer', () => {
      const ts = createTimestamp();
      expect(Number.isInteger(ts)).toBe(true);
      expect(ts).toBeGreaterThan(0);
    });

    it('returns a value close to Date.now()', () => {
      const before = Date.now();
      const ts = createTimestamp();
      const after = Date.now();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('createContentHash', () => {
    it('returns a 64-character hex string', () => {
      const hash = createContentHash('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns the same hash for the same input', () => {
      const a = createContentHash('deterministic');
      const b = createContentHash('deterministic');
      expect(a).toBe(b);
    });

    it('returns different hashes for different inputs', () => {
      const a = createContentHash('alpha');
      const b = createContentHash('beta');
      expect(a).not.toBe(b);
    });
  });

  describe('UlidSchema', () => {
    it('accepts a valid ULID', () => {
      const result = UlidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(result.success).toBe(true);
    });

    it('rejects a lowercase ULID', () => {
      const result = UlidSchema.safeParse('01arz3ndektsv4rrffq69g5fav');
      expect(result.success).toBe(false);
    });

    it('rejects a string that is too short', () => {
      const result = UlidSchema.safeParse('01ARZ3');
      expect(result.success).toBe(false);
    });

    it('rejects an empty string', () => {
      const result = UlidSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('ContentHashSchema', () => {
    it('accepts a valid 64-char hex string', () => {
      const hex = 'a'.repeat(64);
      const result = ContentHashSchema.safeParse(hex);
      expect(result.success).toBe(true);
    });

    it('rejects uppercase hex', () => {
      const hex = 'A'.repeat(64);
      const result = ContentHashSchema.safeParse(hex);
      expect(result.success).toBe(false);
    });

    it('rejects a string that is too short', () => {
      const result = ContentHashSchema.safeParse('abcdef');
      expect(result.success).toBe(false);
    });
  });

  describe('TimestampSchema', () => {
    it('accepts a non-negative integer', () => {
      const result = TimestampSchema.safeParse(1_000_000);
      expect(result.success).toBe(true);
    });

    it('accepts zero', () => {
      const result = TimestampSchema.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('rejects a negative number', () => {
      const result = TimestampSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('rejects a floating-point number', () => {
      const result = TimestampSchema.safeParse(1.5);
      expect(result.success).toBe(false);
    });
  });

  describe('SemVerSchema', () => {
    it('accepts a simple version', () => {
      const result = SemVerSchema.safeParse('1.2.3');
      expect(result.success).toBe(true);
    });

    it('accepts a pre-release version', () => {
      const result = SemVerSchema.safeParse('1.0.0-rc.1');
      expect(result.success).toBe(true);
    });

    it('accepts a version with build metadata', () => {
      const result = SemVerSchema.safeParse('1.0.0+build.42');
      expect(result.success).toBe(true);
    });

    it('rejects a version missing the patch segment', () => {
      const result = SemVerSchema.safeParse('1.2');
      expect(result.success).toBe(false);
    });

    it('rejects a bare number', () => {
      const result = SemVerSchema.safeParse('1');
      expect(result.success).toBe(false);
    });
  });
});
