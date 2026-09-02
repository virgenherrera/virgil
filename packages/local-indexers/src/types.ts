import { createHash } from "node:crypto";
import { z } from "zod";
import { ulid } from "ulid";

// ── Branded Primitives (compatible with @virgil/cli shared) ─────────

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Ulid = Brand<string, "Ulid">;
export type ContentHash = Brand<string, "ContentHash">;
export type Timestamp = Brand<number, "Timestamp">;
export type SemVer = Brand<string, "SemVer">;

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export const UlidSchema = z
  .string()
  .regex(ULID_PATTERN, { error: "Invalid ULID format" })
  .transform((v) => v as Ulid);

export const ContentHashSchema = z
  .string()
  .regex(CONTENT_HASH_PATTERN, {
    error:
      "Invalid content hash: expected 64-character lowercase SHA-256 hex digest",
  })
  .transform((v) => v as ContentHash);

export const TimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((v) => v as Timestamp);

export function createUlid(): Ulid {
  return ulid() as Ulid;
}

export function createTimestamp(): Timestamp {
  return Date.now() as Timestamp;
}

export function createContentHash(content: string): ContentHash {
  return createHash("sha256")
    .update(content, "utf-8")
    .digest("hex") as ContentHash;
}

// ── Cloud Source ─────────────────────────────────────────────────────

export enum CloudSource {
  GOOGLE_DRIVE = "gdrive",
  ONEDRIVE = "onedrive",
  LOCAL = "local",
}

export enum SyncStatus {
  SYNCED = "synced",
  PLACEHOLDER = "placeholder",
  CONFLICT = "conflict",
  UNKNOWN = "unknown",
}

// ── File System Events ──────────────────────────────────────────────

export enum FileChangeType {
  CREATED = "created",
  MODIFIED = "modified",
  DELETED = "deleted",
  RENAMED = "renamed",
}

export interface FileChangeEvent {
  readonly type: FileChangeType;
  readonly path: string;
  readonly timestamp: Timestamp;
}

// ── File Metadata ───────────────────────────────────────────────────

export interface FileMetadata {
  readonly cloudSource: CloudSource;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly syncRoot: string;
  readonly folderHierarchy: string;
  readonly fileSizeBytes: number;
  readonly contentHash: ContentHash;
  readonly mimeType: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly syncStatus: SyncStatus;
  readonly indexedAt: string;
}

// ── Content Extraction ──────────────────────────────────────────────

export interface ExtractionResult {
  readonly text: string;
  readonly formatMetadata: Readonly<Record<string, unknown>>;
  readonly extractedAt: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface ContentExtractor {
  readonly name: string;
  supportedExtensions(): readonly string[];
  extract(filePath: string, metadata: FileMetadata): Promise<ExtractionResult>;
}

// ── Indexed Artifact ────────────────────────────────────────────────

export interface IndexedArtifact {
  readonly id: Ulid;
  readonly contentHash: ContentHash;
  readonly sourceUri: string;
  readonly mimeType: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: FileMetadata;
  readonly formatMetadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly deletedAt?: Timestamp;
  readonly providerId: string;
}

// ── Artifact Store ──────────────────────────────────────────────────

export interface ArtifactStore {
  findByContentHash(hash: ContentHash): Promise<IndexedArtifact | null>;
  findBySourceUri(uri: string): Promise<IndexedArtifact | null>;
  save(artifact: IndexedArtifact): Promise<void>;
  markDeleted(sourceUri: string, deletedAt: Timestamp): Promise<void>;
  list(
    cursor?: string,
    limit?: number,
  ): Promise<{
    items: IndexedArtifact[];
    cursor?: string;
    hasMore: boolean;
  }>;
  findAll(): Promise<IndexedArtifact[]>;
}

// ── Provider Types (compatible with H04) ────────────────────────────

export enum ProviderCapability {
  KNOWLEDGE = "knowledge",
}

export enum ProviderStatus {
  REGISTERED = "registered",
  CONFIGURED = "configured",
  CONNECTED = "connected",
  DEGRADED = "degraded",
  DISCONNECTED = "disconnected",
}

export enum ProviderHealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNAVAILABLE = "unavailable",
}

export interface ProviderMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: SemVer;
  readonly capabilities: readonly ProviderCapability[];
}

export interface ProviderHealth {
  readonly status: ProviderHealthStatus;
  readonly lastChecked: Timestamp;
  readonly message?: string;
}

export interface ContentIdentity {
  readonly uri: string;
  readonly hash: ContentHash;
  readonly version?: string;
  readonly discoveredAt: Timestamp;
}

export interface KnowledgeDocument {
  readonly identity: ContentIdentity;
  readonly title: string;
  readonly mimeType: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

export interface DiscoveryScope {
  readonly maxDepth?: number;
  readonly maxItems?: number;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly since?: Timestamp;
}

// ── Module Configuration ────────────────────────────────────────────

export interface IndexerModuleOptions {
  readonly watchPaths: readonly string[];
  readonly includePatterns?: readonly string[];
  readonly excludePatterns?: readonly string[];
  readonly debounceMs?: number;
}

// ── DI Tokens ───────────────────────────────────────────────────────

export const INDEXER_OPTIONS = Symbol("INDEXER_OPTIONS");
export const ARTIFACT_STORE = Symbol("ARTIFACT_STORE");
