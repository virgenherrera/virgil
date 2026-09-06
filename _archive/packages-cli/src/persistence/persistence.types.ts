import { z } from 'zod';
import {
  ContentHashSchema,
  TimestampSchema,
  UlidSchema,
  createTimestamp,
} from '../shared/primitives.js';
import type { ContentHash, Timestamp, Ulid } from '../shared/primitives.js';
import { ProvenanceRecordSchema } from '../shared/knowledge.types.js';
import type { ProvenanceRecord } from '../shared/knowledge.types.js';

/**
 * Domain-facing Zod schemas and TypeScript types exposed by the
 * repository layer (D8). Every repository method accepts and returns
 * these shapes — never a Drizzle row type or the raw `better-sqlite3`
 * handle — so callers outside `src/persistence/` never observe the ORM.
 *
 * Timestamps cross the persistence boundary as ISO-8601 `text` (SQLite
 * storage, per the H06 data model) on one side and as the shared
 * `Timestamp` (epoch-millisecond) brand on the other; `isoToTimestamp` /
 * `timestampToIso` perform that conversion at the repository edge.
 */

export function timestampToIso(timestamp: Timestamp): string {
  return new Date(timestamp).toISOString();
}

export function isoToTimestamp(iso: string): Timestamp {
  return TimestampSchema.parse(new Date(iso).getTime());
}

export function nowIso(): string {
  return timestampToIso(createTimestamp());
}

// ---------------------------------------------------------------------------
// Lifecycle state (opaque to H06, consumed by H15)
// ---------------------------------------------------------------------------

export const LifecycleState = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const;

export type LifecycleState =
  (typeof LifecycleState)[keyof typeof LifecycleState];

export const LifecycleStateSchema = z.enum([
  LifecycleState.HOT,
  LifecycleState.WARM,
  LifecycleState.COLD,
]);

// ---------------------------------------------------------------------------
// Source (D2 provenance identity, D6 cache metadata, D7 refresh metadata)
// ---------------------------------------------------------------------------

export const SourceSchema = z.object({
  id: UlidSchema,
  providerType: z.string().min(1, { error: 'Provider type must not be empty' }),
  providerInstanceId: z
    .string()
    .min(1, { error: 'Provider instance id must not be empty' }),
  canonicalUri: z.string().min(1, { error: 'Canonical URI must not be empty' }),
  displayName: z.string().min(1, { error: 'Display name must not be empty' }),
  authScope: z.string().min(1).optional(),
  contentHash: ContentHashSchema.optional(),
  etag: z.string().min(1).optional(),
  contentLength: z.number().int().nonnegative().optional(),
  lastModified: z.string().min(1).optional(),
  ttlSeconds: z.number().int().positive().optional(),
  isStale: z.boolean(),
  lastCheckedAt: TimestampSchema.optional(),
  lastSuccessfulRefreshAt: TimestampSchema.optional(),
  lastFailureAt: TimestampSchema.optional(),
  failureCount: z.number().int().nonnegative(),
  refreshIntervalSeconds: z.number().int().positive(),
  nextRefreshDueAt: TimestampSchema.optional(),
  discoveredAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Source = z.infer<typeof SourceSchema>;

export const CreateSourceInputSchema = z.object({
  providerType: SourceSchema.shape.providerType,
  providerInstanceId: SourceSchema.shape.providerInstanceId,
  canonicalUri: SourceSchema.shape.canonicalUri,
  displayName: SourceSchema.shape.displayName,
  authScope: SourceSchema.shape.authScope,
  refreshIntervalSeconds: SourceSchema.shape.refreshIntervalSeconds,
});

export type CreateSourceInput = z.infer<typeof CreateSourceInputSchema>;

/** Fields recorded after a fetch attempt, feeding the D6/D7 cache/refresh state machine. */
export const RecordSourceFetchInputSchema = z.object({
  id: UlidSchema,
  contentHash: ContentHashSchema,
  contentLength: z.number().int().nonnegative(),
  etag: z.string().min(1).optional(),
  lastModified: z.string().min(1).optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

export type RecordSourceFetchInput = z.infer<
  typeof RecordSourceFetchInputSchema
>;

// ---------------------------------------------------------------------------
// Artifact (D1, D3) — maps onto `KnowledgeArtifact` plus persistence extensions
// ---------------------------------------------------------------------------

export const ArtifactSchema = z.object({
  id: UlidSchema,
  sourceId: UlidSchema,
  contentHash: ContentHashSchema,
  contentLength: z.number().int().nonnegative(),
  mimeType: z.string().min(1, { error: 'MIME type must not be empty' }),
  title: z.string().min(1, { error: 'Title must not be empty' }),
  sourceUri: z.string().min(1, { error: 'Source URI must not be empty' }),
  normalizedContent: z.string(),
  lifecycleState: LifecycleStateSchema,
  providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
  providerCapability: z
    .string()
    .min(1, { error: 'Provider capability must not be empty' }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const CreateArtifactInputSchema = z.object({
  sourceId: UlidSchema,
  contentHash: ContentHashSchema,
  contentLength: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  title: z.string().min(1),
  sourceUri: z.string().min(1),
  normalizedContent: z.string(),
  providerId: z.string().min(1),
  providerCapability: z.string().min(1),
  lifecycleState: LifecycleStateSchema.default(LifecycleState.HOT),
});

/**
 * `z.input` (not `z.infer`/output) so `lifecycleState` stays optional at
 * the call site — matching the schema's actual runtime permissiveness,
 * since `.default(...)` fills it in during `.parse()`.
 */
export type CreateArtifactInput = z.input<typeof CreateArtifactInputSchema>;

// ---------------------------------------------------------------------------
// Provenance (D2) — re-exports the shared `ProvenanceRecord` contract
// ---------------------------------------------------------------------------

export { ProvenanceRecordSchema };
export type { ProvenanceRecord };

export const CreateProvenanceRecordInputSchema = z.object({
  artifactId: UlidSchema,
  sourceId: UlidSchema,
  sourceUri: z.string().min(1),
  fetchedBy: z.string().min(1),
  contentHashAtFetch: ContentHashSchema,
});

export type CreateProvenanceRecordInput = z.infer<
  typeof CreateProvenanceRecordInputSchema
>;

// ---------------------------------------------------------------------------
// Chunk (D1)
// ---------------------------------------------------------------------------

export const ChunkMetadataSchema = z.record(z.string(), z.unknown());
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

export const ChunkSchema = z.object({
  id: UlidSchema,
  artifactId: UlidSchema,
  contentHash: ContentHashSchema,
  content: z.string(),
  position: z.number().int().nonnegative(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  metadata: ChunkMetadataSchema.optional(),
  createdAt: TimestampSchema,
});

export type Chunk = z.infer<typeof ChunkSchema>;

export const CreateChunkInputSchema = z.object({
  artifactId: UlidSchema,
  contentHash: ContentHashSchema,
  content: z.string(),
  position: z.number().int().nonnegative(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  metadata: ChunkMetadataSchema.optional(),
});

export type CreateChunkInput = z.infer<typeof CreateChunkInputSchema>;

/** `CreateChunkInput` without `artifactId` — the parent id is supplied separately to `ChunkRepository.insertMany`. */
export const ChunkContentInputSchema = CreateChunkInputSchema.omit({
  artifactId: true,
});
export type ChunkContentInput = z.infer<typeof ChunkContentInputSchema>;

// ---------------------------------------------------------------------------
// Embedding metadata (D1, identity-only — H07 owns vectors)
// ---------------------------------------------------------------------------

export const EmbeddingStatus = {
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export type EmbeddingStatus =
  (typeof EmbeddingStatus)[keyof typeof EmbeddingStatus];

export const EmbeddingStatusSchema = z.enum([
  EmbeddingStatus.PENDING,
  EmbeddingStatus.READY,
  EmbeddingStatus.FAILED,
]);

export const EmbeddingMetaSchema = z.object({
  id: UlidSchema,
  chunkId: UlidSchema,
  modelId: z.string().min(1),
  dimensions: z.number().int().positive(),
  generatedAt: TimestampSchema.optional(),
  status: EmbeddingStatusSchema,
});

export type EmbeddingMeta = z.infer<typeof EmbeddingMetaSchema>;

export const CreateEmbeddingMetaInputSchema = z.object({
  chunkId: UlidSchema,
  modelId: z.string().min(1),
  dimensions: z.number().int().positive(),
  status: EmbeddingStatusSchema.default(EmbeddingStatus.PENDING),
});

/** `z.input`, not `z.infer` — see {@link CreateArtifactInput}. */
export type CreateEmbeddingMetaInput = z.input<
  typeof CreateEmbeddingMetaInputSchema
>;

// ---------------------------------------------------------------------------
// Relationship graph (D4) — extensible type, closed known-set documented
// ---------------------------------------------------------------------------

/** Minimum supported relationship types (handoff D4). Not exhaustive. */
export const RELATIONSHIP_TYPES = [
  'references',
  'derives_from',
  'supersedes',
  'relates_to',
  'part_of',
] as const;

export type KnownRelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * `relationshipType` is validated as a non-empty string, not a closed
 * Zod enum: new relationship types are an application-layer (Zod)
 * decision, never a schema migration (D4 acceptance criterion).
 */
export const RelationshipMetadataSchema = z.record(z.string(), z.unknown());
export type RelationshipMetadata = z.infer<typeof RelationshipMetadataSchema>;

export const RelationshipSchema = z.object({
  id: UlidSchema,
  sourceArtifactId: UlidSchema,
  targetArtifactId: UlidSchema,
  relationshipType: z
    .string()
    .min(1, { error: 'Relationship type must not be empty' }),
  metadata: RelationshipMetadataSchema.optional(),
  createdAt: TimestampSchema,
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export const CreateRelationshipInputSchema = z.object({
  sourceArtifactId: UlidSchema,
  targetArtifactId: UlidSchema,
  relationshipType: z.string().min(1),
  metadata: RelationshipMetadataSchema.optional(),
});

export type CreateRelationshipInput = z.infer<
  typeof CreateRelationshipInputSchema
>;

/** One hop of a recursive relationship traversal (see `RelationshipRepository.traverse`). */
export const RelationshipTraversalNodeSchema = z.object({
  artifactId: UlidSchema,
  depth: z.number().int().nonnegative(),
  viaRelationshipId: UlidSchema.optional(),
  viaRelationshipType: z.string().min(1).optional(),
});

export type RelationshipTraversalNode = z.infer<
  typeof RelationshipTraversalNodeSchema
>;

// ---------------------------------------------------------------------------
// Task association (D5)
// ---------------------------------------------------------------------------

export const TaskAssociationType = {
  DISCOVERED_FOR: 'discovered_for',
  REFERENCED_BY: 'referenced_by',
  PRODUCED_BY: 'produced_by',
} as const;

export type TaskAssociationType =
  (typeof TaskAssociationType)[keyof typeof TaskAssociationType];

export const TaskAssociationTypeSchema = z.enum([
  TaskAssociationType.DISCOVERED_FOR,
  TaskAssociationType.REFERENCED_BY,
  TaskAssociationType.PRODUCED_BY,
]);

export const TaskAssociationSchema = z.object({
  id: UlidSchema,
  artifactId: UlidSchema,
  taskId: z.string().min(1, { error: 'Task id must not be empty' }),
  taskProviderType: z
    .string()
    .min(1, { error: 'Task provider type must not be empty' }),
  associationType: TaskAssociationTypeSchema,
  createdAt: TimestampSchema,
});

export type TaskAssociation = z.infer<typeof TaskAssociationSchema>;

export const CreateTaskAssociationInputSchema = z.object({
  artifactId: UlidSchema,
  taskId: z.string().min(1),
  taskProviderType: z.string().min(1),
  associationType: TaskAssociationTypeSchema,
});

export type CreateTaskAssociationInput = z.infer<
  typeof CreateTaskAssociationInputSchema
>;

// ---------------------------------------------------------------------------
// Composite ingestion input (D8 — atomic multi-table write)
// ---------------------------------------------------------------------------

export const IngestArtifactInputSchema = z.object({
  artifact: CreateArtifactInputSchema,
  provenance: CreateProvenanceRecordInputSchema.omit({ artifactId: true }),
  chunks: z
    .array(CreateChunkInputSchema.omit({ artifactId: true }))
    .default([]),
  relationships: z
    .array(CreateRelationshipInputSchema.omit({ sourceArtifactId: true }))
    .default([]),
  taskAssociations: z
    .array(CreateTaskAssociationInputSchema.omit({ artifactId: true }))
    .default([]),
});

/** `z.input`, not `z.infer` — `chunks`/`relationships`/`taskAssociations` stay optional. */
export type IngestArtifactInput = z.input<typeof IngestArtifactInputSchema>;

export interface IngestArtifactResult {
  readonly artifact: Artifact;
  readonly provenance: ProvenanceRecord;
  readonly chunks: readonly Chunk[];
  readonly relationships: readonly Relationship[];
  readonly taskAssociations: readonly TaskAssociation[];
}

export type { ContentHash, Timestamp, Ulid };
