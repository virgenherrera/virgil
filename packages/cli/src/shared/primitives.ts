import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ulid } from 'ulid';

/**
 * Nominal typing utility. Intersects `T` with a phantom `__brand` tag so
 * that structurally identical primitives (e.g. two `string`s) are not
 * interchangeable at the type level.
 *
 * The `__brand` property never exists at runtime — it is erased by the
 * TypeScript compiler and exists purely to make the type system reject
 * accidental mixing of distinct value objects.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** A ULID (Universally Unique Lexicographically Sortable Identifier). */
export type Ulid = Brand<string, 'Ulid'>;

/** A SHA-256 hex digest identifying a piece of content. */
export type ContentHash = Brand<string, 'ContentHash'>;

/** A Unix epoch timestamp expressed in milliseconds. */
export type Timestamp = Brand<number, 'Timestamp'>;

/** A semantic version string (e.g. `1.2.3`, `1.2.3-rc.1`). */
export type SemVer = Brand<string, 'SemVer'>;

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Validates and brands a ULID string. */
export const UlidSchema = z
  .string()
  .regex(ULID_PATTERN, { error: 'Invalid ULID format' })
  .transform((value) => value as Ulid);

/** Validates and brands a SHA-256 hex digest string. */
export const ContentHashSchema = z
  .string()
  .regex(CONTENT_HASH_PATTERN, {
    error:
      'Invalid content hash: expected a 64-character lowercase SHA-256 hex digest',
  })
  .transform((value) => value as ContentHash);

/** Validates and brands a Unix epoch millisecond timestamp. */
export const TimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((value) => value as Timestamp);

/** Validates and brands a semantic version string. */
export const SemVerSchema = z
  .string()
  .regex(SEMVER_PATTERN, { error: 'Invalid semantic version' })
  .transform((value) => value as SemVer);

/** Generates a new ULID. */
export function createUlid(): Ulid {
  return ulid() as Ulid;
}

/** Captures the current instant as a branded {@link Timestamp}. */
export function createTimestamp(): Timestamp {
  return Date.now() as Timestamp;
}

/** Computes the SHA-256 hex digest of `content` as a branded {@link ContentHash}. */
export function createContentHash(content: string): ContentHash {
  return createHash('sha256')
    .update(content, 'utf-8')
    .digest('hex') as ContentHash;
}
