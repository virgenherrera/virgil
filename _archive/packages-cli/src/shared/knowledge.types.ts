import { z } from 'zod';
import type { ContentHash, Timestamp, Ulid } from './primitives.js';
import {
  ContentHashSchema,
  TimestampSchema,
  UlidSchema,
} from './primitives.js';
import { ProviderCapability } from './provider.types.js';

/** A piece of knowledge ingested from a provider and persisted locally. */
export interface KnowledgeArtifact {
  readonly id: Ulid;
  readonly contentHash: ContentHash;
  readonly sourceUri: string;
  readonly mimeType: string;
  readonly title: string;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly providerId: string;
  readonly providerCapability: ProviderCapability;
}

/** Provenance record tracing a {@link KnowledgeArtifact} back to its source. */
export interface ProvenanceRecord {
  readonly id: Ulid;
  readonly artifactId: Ulid;
  readonly sourceUri: string;
  readonly fetchedAt: Timestamp;
  readonly fetchedBy: string;
  readonly contentHashAtFetch: ContentHash;
}

/** Validates the shape of a {@link KnowledgeArtifact}. */
export const KnowledgeArtifactSchema = z.object({
  id: UlidSchema,
  contentHash: ContentHashSchema,
  sourceUri: z.string().min(1, { error: 'Source URI must not be empty' }),
  mimeType: z.string().min(1, { error: 'MIME type must not be empty' }),
  title: z.string().min(1, { error: 'Title must not be empty' }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
  providerCapability: z.nativeEnum(ProviderCapability),
});

export type KnowledgeArtifactShape = z.infer<typeof KnowledgeArtifactSchema>;

/** Validates the shape of a {@link ProvenanceRecord}. */
export const ProvenanceRecordSchema = z.object({
  id: UlidSchema,
  artifactId: UlidSchema,
  sourceUri: z.string().min(1, { error: 'Source URI must not be empty' }),
  fetchedAt: TimestampSchema,
  fetchedBy: z
    .string()
    .min(1, { error: 'Fetched-by provider id must not be empty' }),
  contentHashAtFetch: ContentHashSchema,
});

export type ProvenanceRecordShape = z.infer<typeof ProvenanceRecordSchema>;
