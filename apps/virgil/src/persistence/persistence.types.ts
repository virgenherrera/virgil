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

export function timestampToIso(timestamp: Timestamp): string {
  return new Date(timestamp).toISOString();
}

export function isoToTimestamp(iso: string): Timestamp {
  return TimestampSchema.parse(new Date(iso).getTime());
}

export function nowIso(): string {
  return timestampToIso(createTimestamp());
}

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

export type CreateArtifactInput = z.input<typeof CreateArtifactInputSchema>;

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

export const ChunkContentInputSchema = CreateChunkInputSchema.omit({
  artifactId: true,
});
export type ChunkContentInput = z.infer<typeof ChunkContentInputSchema>;

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

export type CreateEmbeddingMetaInput = z.input<
  typeof CreateEmbeddingMetaInputSchema
>;

export const RELATIONSHIP_TYPES = [
  'references',
  'derives_from',
  'supersedes',
  'relates_to',
  'part_of',
] as const;

export type KnownRelationshipType = (typeof RELATIONSHIP_TYPES)[number];

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

export const RelationshipTraversalNodeSchema = z.object({
  artifactId: UlidSchema,
  depth: z.number().int().nonnegative(),
  viaRelationshipId: UlidSchema.optional(),
  viaRelationshipType: z.string().min(1).optional(),
});

export type RelationshipTraversalNode = z.infer<
  typeof RelationshipTraversalNodeSchema
>;

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

export type IngestArtifactInput = z.input<typeof IngestArtifactInputSchema>;

export interface IngestArtifactResult {
  readonly artifact: Artifact;
  readonly provenance: ProvenanceRecord;
  readonly chunks: readonly Chunk[];
  readonly relationships: readonly Relationship[];
  readonly taskAssociations: readonly TaskAssociation[];
}

export type { ContentHash, Timestamp, Ulid };
