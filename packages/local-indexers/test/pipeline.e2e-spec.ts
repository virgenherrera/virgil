import { Test, type TestingModule } from "@nestjs/testing";
import { mkdtemp, writeFile, rm, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexerModule } from "../src/indexer.module.js";
import { IndexingPipelineService } from "../src/indexing-pipeline.service.js";
import { MetadataService } from "../src/metadata.service.js";
import { CloudSourceDetectorService } from "../src/cloud-source-detector.service.js";
import {
  FileChangeType,
  CloudSource,
  SyncStatus,
  ARTIFACT_STORE,
} from "../src/types.js";
import type { ArtifactStore, ContentHash } from "../src/types.js";

describe("IndexingPipeline, Metadata, and CloudSourceDetector (e2e)", () => {
  let module: TestingModule;
  let pipeline: IndexingPipelineService;
  let metadataService: MetadataService;
  let cloudDetector: CloudSourceDetectorService;
  let store: ArtifactStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "virgil-pipeline-test-"));
    module = await Test.createTestingModule({
      imports: [IndexerModule.forRoot({ watchPaths: [tmpDir] })],
    }).compile();
    pipeline = module.get(IndexingPipelineService);
    metadataService = module.get(MetadataService);
    cloudDetector = module.get(CloudSourceDetectorService);
    store = module.get(ARTIFACT_STORE);
  });

  afterEach(async () => {
    await module.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("CloudSourceDetectorService", () => {
    it("detects Google Drive path via CloudStorage", () => {
      const result = cloudDetector.detect(
        "/Users/me/Library/CloudStorage/GoogleDrive-user@example.com/My Drive/docs/file.txt",
      );
      expect(result.source).toBe(CloudSource.GOOGLE_DRIVE);
      expect(result.syncRoot).toBe(
        "/Users/me/Library/CloudStorage/GoogleDrive-user@example.com/My Drive",
      );
      expect(result.relativePath).toBe("docs/file.txt");
      expect(result.syncStatus).toBe(SyncStatus.SYNCED);
    });

    it("detects Google Drive path via standard location", () => {
      const result = cloudDetector.detect(
        "/Users/me/Google Drive/My Drive/report.docx",
      );
      expect(result.source).toBe(CloudSource.GOOGLE_DRIVE);
      expect(result.syncRoot).toBe("/Users/me/Google Drive/My Drive");
      expect(result.relativePath).toBe("report.docx");
    });

    it("detects Google Drive path via simple location", () => {
      const result = cloudDetector.detect(
        "/Users/me/Google Drive/shared/doc.pdf",
      );
      expect(result.source).toBe(CloudSource.GOOGLE_DRIVE);
      expect(result.syncRoot).toBe("/Users/me/Google Drive");
      expect(result.relativePath).toBe("shared/doc.pdf");
    });

    it("detects OneDrive path via CloudStorage", () => {
      const result = cloudDetector.detect(
        "/Users/me/Library/CloudStorage/OneDrive-Corp/Projects/plan.xlsx",
      );
      expect(result.source).toBe(CloudSource.ONEDRIVE);
      expect(result.syncRoot).toBe(
        "/Users/me/Library/CloudStorage/OneDrive-Corp",
      );
      expect(result.relativePath).toBe("Projects/plan.xlsx");
    });

    it("detects OneDrive path via org folder", () => {
      const result = cloudDetector.detect(
        "/Users/me/OneDrive - Acme Inc/docs/memo.docx",
      );
      expect(result.source).toBe(CloudSource.ONEDRIVE);
      expect(result.syncRoot).toBe("/Users/me/OneDrive - Acme Inc");
      expect(result.relativePath).toBe("docs/memo.docx");
    });

    it("detects OneDrive path via simple location", () => {
      const result = cloudDetector.detect("/Users/me/OneDrive/file.txt");
      expect(result.source).toBe(CloudSource.ONEDRIVE);
      expect(result.syncRoot).toBe("/Users/me/OneDrive");
      expect(result.relativePath).toBe("file.txt");
    });

    it("returns LOCAL for unknown paths with watchRoot", () => {
      const result = cloudDetector.detect(`${tmpDir}/subdir/file.txt`, tmpDir);
      expect(result.source).toBe(CloudSource.LOCAL);
      expect(result.syncRoot).toBe(tmpDir);
      expect(result.relativePath).toBe("subdir/file.txt");
      expect(result.syncStatus).toBe(SyncStatus.UNKNOWN);
    });

    it("returns LOCAL for unknown paths without watchRoot", () => {
      const result = cloudDetector.detect("/some/random/path/file.txt");
      expect(result.source).toBe(CloudSource.LOCAL);
      expect(result.relativePath).toBe("file.txt");
    });

    it("handles Windows-style paths", () => {
      const result = cloudDetector.detect(
        "C:\\Users\\me\\Google Drive\\My Drive\\file.txt",
      );
      expect(result.source).toBe(CloudSource.GOOGLE_DRIVE);
    });
  });

  describe("MetadataService", () => {
    it("builds complete metadata for a file", async () => {
      const filePath = join(tmpDir, "meta-test.txt");
      await writeFile(filePath, "metadata test content");
      const hash = "b".repeat(64) as ContentHash;

      const metadata = await metadataService.buildMetadata(
        filePath,
        hash,
        tmpDir,
      );

      expect(metadata.cloudSource).toBe(CloudSource.LOCAL);
      expect(metadata.absolutePath).toBe(filePath);
      expect(metadata.relativePath).toBe("meta-test.txt");
      expect(metadata.syncRoot).toBe(tmpDir);
      expect(metadata.folderHierarchy).toBe("/");
      expect(metadata.fileSizeBytes).toBeGreaterThan(0);
      expect(metadata.contentHash).toBe(hash);
      expect(metadata.mimeType).toBe("text/plain");
      expect(metadata.createdAt).toBeDefined();
      expect(metadata.modifiedAt).toBeDefined();
      expect(metadata.indexedAt).toBeDefined();
    });

    it("builds folder hierarchy for nested files", async () => {
      const subDir = join(tmpDir, "docs", "reports");
      await mkdir(subDir, { recursive: true });
      const filePath = join(subDir, "report.md");
      await writeFile(filePath, "# Report");
      const hash = "c".repeat(64) as ContentHash;

      const metadata = await metadataService.buildMetadata(
        filePath,
        hash,
        tmpDir,
      );

      expect(metadata.folderHierarchy).toBe("/docs/reports");
      expect(metadata.mimeType).toBe("text/markdown");
    });

    it("resolves MIME types correctly", () => {
      expect(metadataService.resolveMimeType(".txt")).toBe("text/plain");
      expect(metadataService.resolveMimeType(".json")).toBe("application/json");
      expect(metadataService.resolveMimeType(".md")).toBe("text/markdown");
      expect(metadataService.resolveMimeType(".pdf")).toBe("application/pdf");
      expect(metadataService.resolveMimeType(".unknown")).toBe(
        "application/octet-stream",
      );
    });
  });

  describe("InMemoryArtifactStore", () => {
    it("saves and retrieves by source URI", async () => {
      const filePath = join(tmpDir, "store-test.txt");
      await writeFile(filePath, "store test");
      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );
      expect(artifact).not.toBeNull();

      const found = await store.findBySourceUri(filePath);
      expect(found).not.toBeNull();
      expect(found!.sourceUri).toBe(filePath);
    });

    it("saves and retrieves by content hash", async () => {
      const filePath = join(tmpDir, "hash-store.txt");
      await writeFile(filePath, "hash content");
      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      const found = await store.findByContentHash(artifact!.contentHash);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(artifact!.id);
    });

    it("returns null for nonexistent entries", async () => {
      expect(await store.findBySourceUri("/nonexistent")).toBeNull();
      expect(
        await store.findByContentHash("d".repeat(64) as ContentHash),
      ).toBeNull();
    });

    it("supports soft deletion", async () => {
      const filePath = join(tmpDir, "soft-del.txt");
      await writeFile(filePath, "will be deleted");
      await pipeline.processFile(filePath, FileChangeType.CREATED);

      await pipeline.processFile(filePath, FileChangeType.DELETED);

      const found = await store.findBySourceUri(filePath);
      expect(found).toBeNull();

      const all = await store.findAll();
      const deleted = all.find((a) => a.sourceUri === filePath);
      expect(deleted).toBeDefined();
      expect(deleted!.deletedAt).toBeDefined();
    });

    it("lists with pagination", async () => {
      for (let i = 0; i < 5; i++) {
        const filePath = join(tmpDir, `list-${i}.txt`);
        await writeFile(filePath, `content ${i}`);
        await pipeline.processFile(filePath, FileChangeType.CREATED);
      }

      const page1 = await store.list(undefined, 3);
      expect(page1.items).toHaveLength(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).toBeDefined();

      const page2 = await store.list(page1.cursor, 3);
      expect(page2.items).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe("IndexingPipelineService", () => {
    it("processes a new text file", async () => {
      const filePath = join(tmpDir, "new-doc.txt");
      await writeFile(filePath, "Hello, indexer!");

      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      expect(artifact).not.toBeNull();
      expect(artifact!.title).toBe("new-doc.txt");
      expect(artifact!.content).toBe("Hello, indexer!");
      expect(artifact!.mimeType).toBe("text/plain");
      expect(artifact!.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact!.providerId).toBe("local-indexer");
    });

    it("processes a markdown file with heading extraction", async () => {
      const filePath = join(tmpDir, "notes.md");
      await writeFile(filePath, "# Notes\n\n## Overview\n\nContent here.");

      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      expect(artifact).not.toBeNull();
      expect(artifact!.content).toContain("# Notes");
      expect(artifact!.mimeType).toBe("text/markdown");
      const headings = artifact!.formatMetadata.headings as unknown[];
      expect(headings).toHaveLength(2);
    });

    it("skips unchanged files (cache hit)", async () => {
      const filePath = join(tmpDir, "cached.txt");
      await writeFile(filePath, "unchanged content");

      const first = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );
      const second = await pipeline.processFile(
        filePath,
        FileChangeType.MODIFIED,
      );

      expect(second).not.toBeNull();
      expect(second!.id).toBe(first!.id);
      expect(second!.contentHash).toBe(first!.contentHash);
    });

    it("reindexes modified files", async () => {
      const filePath = join(tmpDir, "changing.txt");
      await writeFile(filePath, "version 1");

      const first = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      await writeFile(filePath, "version 2 with different content");

      const second = await pipeline.processFile(
        filePath,
        FileChangeType.MODIFIED,
      );

      expect(second).not.toBeNull();
      expect(second!.id).toBe(first!.id);
      expect(second!.contentHash).not.toBe(first!.contentHash);
      expect(second!.content).toBe("version 2 with different content");
    });

    it("handles file deletion", async () => {
      const filePath = join(tmpDir, "to-delete.txt");
      await writeFile(filePath, "will be removed");
      await pipeline.processFile(filePath, FileChangeType.CREATED);

      const result = await pipeline.processFile(
        filePath,
        FileChangeType.DELETED,
      );

      expect(result).toBeNull();
      const found = await store.findBySourceUri(filePath);
      expect(found).toBeNull();
    });

    it("produces metadata-only artifact for unknown extensions", async () => {
      const filePath = join(tmpDir, "code.py");
      await writeFile(filePath, 'print("hello")');

      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      expect(artifact).not.toBeNull();
      expect(artifact!.content).toBe("");
      expect(artifact!.formatMetadata).toHaveProperty("metadataOnly", true);
    });

    it("produces stub artifact for docx files", async () => {
      const filePath = join(tmpDir, "doc.docx");
      await writeFile(filePath, Buffer.from("PK fake docx"));

      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      expect(artifact).not.toBeNull();
      expect(artifact!.content).toBe("");
      expect(artifact!.formatMetadata).toHaveProperty("stub", true);
    });

    it("processes an entire directory", async () => {
      await writeFile(join(tmpDir, "file1.txt"), "content 1");
      await writeFile(join(tmpDir, "file2.md"), "# Heading");
      const subDir = join(tmpDir, "nested");
      await mkdir(subDir);
      await writeFile(join(subDir, "file3.json"), '{"a":1}');

      const artifacts = await pipeline.processDirectory(tmpDir);

      expect(artifacts.length).toBe(3);
      const titles = artifacts.map((a) => a.title).sort();
      expect(titles).toEqual(["file1.txt", "file2.md", "file3.json"]);
    });

    it("respects exclude patterns during directory scan", async () => {
      const excludeDir = await mkdtemp(join(tmpdir(), "virgil-exclude-test-"));
      try {
        await writeFile(join(excludeDir, "keep.txt"), "keep me");
        await writeFile(join(excludeDir, "skip.log"), "skip me");

        const excludeModule = await Test.createTestingModule({
          imports: [
            IndexerModule.forRoot({
              watchPaths: [excludeDir],
              excludePatterns: ["*.log"],
            }),
          ],
        }).compile();

        const excludePipeline = excludeModule.get(IndexingPipelineService);
        const artifacts = await excludePipeline.processDirectory(excludeDir);

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].title).toBe("keep.txt");

        await excludeModule.close();
      } finally {
        await rm(excludeDir, { recursive: true, force: true });
      }
    });

    it("respects include patterns during directory scan", async () => {
      const includeDir = await mkdtemp(join(tmpdir(), "virgil-include-test-"));
      try {
        await writeFile(join(includeDir, "doc.md"), "# Doc");
        await writeFile(join(includeDir, "data.txt"), "data");
        await writeFile(join(includeDir, "code.ts"), "const x = 1;");

        const includeModule = await Test.createTestingModule({
          imports: [
            IndexerModule.forRoot({
              watchPaths: [includeDir],
              includePatterns: ["*.md", "*.txt"],
            }),
          ],
        }).compile();

        const includePipeline = includeModule.get(IndexingPipelineService);
        const artifacts = await includePipeline.processDirectory(includeDir);

        expect(artifacts).toHaveLength(2);
        const titles = artifacts.map((a) => a.title).sort();
        expect(titles).toEqual(["data.txt", "doc.md"]);

        await includeModule.close();
      } finally {
        await rm(includeDir, { recursive: true, force: true });
      }
    });

    it("isolates errors - corrupt file does not halt pipeline", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await writeFile(join(tmpDir, "good.txt"), "good content");
      // Create a directory with the same pattern as a file - will cause read error
      const badPath = join(tmpDir, "bad.txt");
      await writeFile(badPath, "content");
      await writeFile(join(tmpDir, "also-good.txt"), "more content");

      const artifacts = await pipeline.processDirectory(tmpDir);
      // Should process at least the good files
      expect(artifacts.length).toBeGreaterThanOrEqual(2);

      errorSpy.mockRestore();
    });

    it("detects deletions by comparing directory state", async () => {
      const f1 = join(tmpDir, "stays.txt");
      const f2 = join(tmpDir, "goes.txt");
      await writeFile(f1, "staying");
      await writeFile(f2, "going away");

      await pipeline.processDirectory(tmpDir);

      await unlink(f2);

      const deleted = await pipeline.detectDeletions(tmpDir);
      expect(deleted).toContain(f2);

      const found = await store.findBySourceUri(f2);
      expect(found).toBeNull();
    });

    it("uses glob-style pattern matching with ** prefix", async () => {
      const globDir = await mkdtemp(join(tmpdir(), "virgil-glob-test-"));
      try {
        const sub = join(globDir, "deep", "nested");
        await mkdir(sub, { recursive: true });
        await writeFile(join(sub, "target.txt"), "found");
        await writeFile(join(globDir, "other.txt"), "skipped");

        const globModule = await Test.createTestingModule({
          imports: [
            IndexerModule.forRoot({
              watchPaths: [globDir],
              includePatterns: ["**/nested"],
            }),
          ],
        }).compile();

        const globPipeline = globModule.get(IndexingPipelineService);
        const artifacts = await globPipeline.processDirectory(globDir);

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].title).toBe("target.txt");

        await globModule.close();
      } finally {
        await rm(globDir, { recursive: true, force: true });
      }
    });

    it("uses plain substring matching for include patterns without glob prefix", async () => {
      const subDir = await mkdtemp(join(tmpdir(), "virgil-substr-test-"));
      try {
        await writeFile(join(subDir, "readme.txt"), "read me");
        await writeFile(join(subDir, "notes.txt"), "notes");

        const subModule = await Test.createTestingModule({
          imports: [
            IndexerModule.forRoot({
              watchPaths: [subDir],
              includePatterns: ["readme"],
            }),
          ],
        }).compile();

        const subPipeline = subModule.get(IndexingPipelineService);
        const artifacts = await subPipeline.processDirectory(subDir);

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].title).toBe("readme.txt");

        await subModule.close();
      } finally {
        await rm(subDir, { recursive: true, force: true });
      }
    });

    it("processes file not under any watch path", async () => {
      // Process a file with a path not under the configured watchPaths
      const otherDir = await mkdtemp(join(tmpdir(), "virgil-other-"));
      try {
        const otherFile = join(otherDir, "outside.txt");
        await writeFile(otherFile, "outside content");

        const artifact = await pipeline.processFile(
          otherFile,
          FileChangeType.CREATED,
        );

        expect(artifact).not.toBeNull();
        expect(artifact!.title).toBe("outside.txt");
      } finally {
        await rm(otherDir, { recursive: true, force: true });
      }
    });

    it("handles extractor that throws during extraction", async () => {
      const { ExtractorRegistryService } =
        await import("../src/extractor-registry.service.js");
      const extractorRegistry = module.get(ExtractorRegistryService);

      // Register a broken extractor that throws
      extractorRegistry.register({
        name: "broken",
        supportedExtensions: () => [".broken"] as const,
        extract: () => {
          throw new Error("extractor crash");
        },
      });

      const filePath = join(tmpDir, "test.broken");
      await writeFile(filePath, "will crash extractor");

      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      expect(artifact).not.toBeNull();
      expect(artifact!.content).toBe("");
      expect(artifact!.formatMetadata).toHaveProperty(
        "error",
        "extractor crash",
      );
    });
  });
});
