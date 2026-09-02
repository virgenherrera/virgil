import { Inject, Injectable } from "@nestjs/common";
import { readdir } from "node:fs/promises";
import { extname, basename, join } from "node:path";
import { ContentHasherService } from "./content-hasher.service.js";
import { ExtractorRegistryService } from "./extractor-registry.service.js";
import { MetadataService } from "./metadata.service.js";
import {
  type ArtifactStore,
  type ExtractionResult,
  FileChangeType,
  type IndexedArtifact,
  type IndexerModuleOptions,
  INDEXER_OPTIONS,
  ARTIFACT_STORE,
  createUlid,
  createTimestamp,
} from "./types.js";

@Injectable()
export class IndexingPipelineService {
  constructor(
    private readonly hasher: ContentHasherService,
    private readonly extractorRegistry: ExtractorRegistryService,
    private readonly metadataService: MetadataService,
    @Inject(ARTIFACT_STORE)
    private readonly store: ArtifactStore,
    @Inject(INDEXER_OPTIONS)
    private readonly options: IndexerModuleOptions,
  ) {}

  async processFile(
    filePath: string,
    changeType: FileChangeType,
  ): Promise<IndexedArtifact | null> {
    if (changeType === FileChangeType.DELETED) {
      await this.store.markDeleted(filePath, createTimestamp());
      return null;
    }

    const hash = await this.hasher.hashFile(filePath);

    const existing = await this.store.findBySourceUri(filePath);
    if (existing && existing.contentHash === hash) {
      return existing;
    }

    const watchRoot = this.findWatchRoot(filePath);
    const metadata = await this.metadataService.buildMetadata(
      filePath,
      hash,
      watchRoot,
    );

    const ext = extname(filePath).toLowerCase();
    const extractor = this.extractorRegistry.extractorFor(ext);
    let extraction: ExtractionResult;

    if (extractor) {
      try {
        extraction = await extractor.extract(filePath, metadata);
      } catch (err) {
        extraction = {
          text: "",
          formatMetadata: {
            error: err instanceof Error ? err.message : String(err),
          },
          extractedAt: new Date().toISOString(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    } else {
      extraction = {
        text: "",
        formatMetadata: { metadataOnly: true, extension: ext },
        extractedAt: new Date().toISOString(),
        success: true,
      };
    }

    const now = createTimestamp();
    const artifact: IndexedArtifact = {
      id: existing?.id ?? createUlid(),
      contentHash: hash,
      sourceUri: filePath,
      mimeType: metadata.mimeType,
      title: basename(filePath),
      content: extraction.text,
      metadata,
      formatMetadata: extraction.formatMetadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      providerId: "local-indexer",
    };

    await this.store.save(artifact);
    return artifact;
  }

  async processDirectory(dirPath: string): Promise<IndexedArtifact[]> {
    const files = await this.scanDirectory(dirPath);
    const results: IndexedArtifact[] = [];

    for (const file of files) {
      if (this.shouldInclude(file)) {
        try {
          const artifact = await this.processFile(file, FileChangeType.CREATED);
          if (artifact) results.push(artifact);
        } catch (err) {
          console.error(
            `Error processing ${file}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    return results;
  }

  async detectDeletions(dirPath: string): Promise<string[]> {
    const currentFiles = new Set(await this.scanDirectory(dirPath));
    const allArtifacts = await this.store.findAll();
    const deleted: string[] = [];

    for (const artifact of allArtifacts) {
      if (
        !artifact.deletedAt &&
        artifact.sourceUri.startsWith(dirPath) &&
        !currentFiles.has(artifact.sourceUri)
      ) {
        await this.store.markDeleted(artifact.sourceUri, createTimestamp());
        deleted.push(artifact.sourceUri);
      }
    }

    return deleted;
  }

  private async scanDirectory(dirPath: string): Promise<string[]> {
    const entries = await readdir(dirPath, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const parent =
          entry.parentPath ?? (entry as { path?: string }).path ?? dirPath;
        return join(parent, entry.name);
      });
  }

  private shouldInclude(filePath: string): boolean {
    const { includePatterns, excludePatterns } = this.options;

    if (excludePatterns?.length) {
      if (excludePatterns.some((p) => this.matchesPattern(filePath, p))) {
        return false;
      }
    }

    if (includePatterns?.length) {
      return includePatterns.some((p) => this.matchesPattern(filePath, p));
    }

    return true;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    if (pattern.startsWith("*.")) {
      return filePath.endsWith(pattern.slice(1));
    }
    if (pattern.startsWith("**/")) {
      return filePath.includes(pattern.slice(3));
    }
    return filePath.includes(pattern);
  }

  private findWatchRoot(filePath: string): string | undefined {
    for (const wp of this.options.watchPaths) {
      if (filePath.startsWith(wp)) return wp;
    }
    return undefined;
  }
}
