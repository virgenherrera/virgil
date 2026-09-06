import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ulid } from 'ulid';

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Ulid = Brand<string, 'Ulid'>;
export type ContentHash = Brand<string, 'ContentHash'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type SemVer = Brand<string, 'SemVer'>;

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const UlidSchema = z
  .string()
  .regex(ULID_PATTERN, { error: 'Invalid ULID format' })
  .transform((value) => value as Ulid);

export const ContentHashSchema = z
  .string()
  .regex(CONTENT_HASH_PATTERN, {
    error:
      'Invalid content hash: expected a 64-character lowercase SHA-256 hex digest',
  })
  .transform((value) => value as ContentHash);

export const TimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((value) => value as Timestamp);

export const SemVerSchema = z
  .string()
  .regex(SEMVER_PATTERN, { error: 'Invalid semantic version' })
  .transform((value) => value as SemVer);

export function createUlid(): Ulid {
  return ulid() as Ulid;
}

export function createTimestamp(): Timestamp {
  return Date.now() as Timestamp;
}

export function createContentHash(content: string): ContentHash {
  return createHash('sha256')
    .update(content, 'utf-8')
    .digest('hex') as ContentHash;
}
