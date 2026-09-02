import { Injectable } from "@nestjs/common";
import type {
  ArtifactStore,
  ContentHash,
  IndexedArtifact,
  Timestamp,
} from "./types.js";

@Injectable()
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, IndexedArtifact>();

  async findByContentHash(hash: ContentHash): Promise<IndexedArtifact | null> {
    for (const artifact of this.artifacts.values()) {
      if (artifact.contentHash === hash && !artifact.deletedAt) {
        return artifact;
      }
    }
    return null;
  }

  async findBySourceUri(uri: string): Promise<IndexedArtifact | null> {
    for (const artifact of this.artifacts.values()) {
      if (artifact.sourceUri === uri && !artifact.deletedAt) {
        return artifact;
      }
    }
    return null;
  }

  async save(artifact: IndexedArtifact): Promise<void> {
    this.artifacts.set(artifact.id, artifact);
  }

  async markDeleted(sourceUri: string, deletedAt: Timestamp): Promise<void> {
    for (const [id, artifact] of this.artifacts) {
      if (artifact.sourceUri === sourceUri && !artifact.deletedAt) {
        this.artifacts.set(id, { ...artifact, deletedAt });
      }
    }
  }

  async list(
    cursor?: string,
    limit = 20,
  ): Promise<{
    items: IndexedArtifact[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const all = [...this.artifacts.values()].filter((a) => !a.deletedAt);
    const start = cursor ? parseInt(cursor, 10) : 0;
    const items = all.slice(start, start + limit);
    const hasMore = start + limit < all.length;
    return {
      items,
      cursor: hasMore ? String(start + limit) : undefined,
      hasMore,
    };
  }

  async findAll(): Promise<IndexedArtifact[]> {
    return [...this.artifacts.values()];
  }
}
