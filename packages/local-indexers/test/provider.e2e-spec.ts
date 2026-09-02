import { Test, type TestingModule } from "@nestjs/testing";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexerModule } from "../src/indexer.module.js";
import { IndexingPipelineService } from "../src/indexing-pipeline.service.js";
import { LocalKnowledgeProviderService } from "../src/local-knowledge-provider.service.js";
import {
  FileChangeType,
  ProviderCapability,
  ProviderHealthStatus,
  ProviderStatus,
  createTimestamp,
  ARTIFACT_STORE,
} from "../src/types.js";
import type { ContentHash, Timestamp } from "../src/types.js";

describe("LocalKnowledgeProviderService (e2e)", () => {
  let module: TestingModule;
  let provider: LocalKnowledgeProviderService;
  let pipeline: IndexingPipelineService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "virgil-provider-test-"));
    module = await Test.createTestingModule({
      imports: [IndexerModule.forRoot({ watchPaths: [tmpDir] })],
    }).compile();
    provider = module.get(LocalKnowledgeProviderService);
    pipeline = module.get(IndexingPipelineService);
  });

  afterEach(async () => {
    await module.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Provider lifecycle", () => {
    it("has correct metadata", () => {
      expect(provider.metadata.id).toBe("local-indexer");
      expect(provider.metadata.name).toBe("Local Filesystem Indexer");
      expect(provider.metadata.version).toBe("0.0.1");
      expect(provider.metadata.capabilities).toContain(
        ProviderCapability.KNOWLEDGE,
      );
    });

    it("starts as REGISTERED", () => {
      expect(provider.status).toBe(ProviderStatus.REGISTERED);
    });

    it("transitions to CONNECTED on initialize", async () => {
      await provider.initialize();
      expect(provider.status).toBe(ProviderStatus.CONNECTED);
    });

    it("reports status via healthCheck", async () => {
      await provider.initialize();
      const status = await provider.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it("transitions to DISCONNECTED on dispose", async () => {
      await provider.initialize();
      await provider.dispose();
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe("discover", () => {
    it("discovers all indexed artifacts", async () => {
      await writeFile(join(tmpDir, "a.txt"), "alpha");
      await writeFile(join(tmpDir, "b.txt"), "beta");
      await pipeline.processDirectory(tmpDir);

      const result = await provider.discover({});
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it("filters by maxItems", async () => {
      await writeFile(join(tmpDir, "x.txt"), "x");
      await writeFile(join(tmpDir, "y.txt"), "y");
      await writeFile(join(tmpDir, "z.txt"), "z");
      await pipeline.processDirectory(tmpDir);

      const result = await provider.discover({ maxItems: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
    });

    it("filters by since timestamp", async () => {
      await writeFile(join(tmpDir, "old.txt"), "old");
      await pipeline.processFile(
        join(tmpDir, "old.txt"),
        FileChangeType.CREATED,
      );

      const midpoint = createTimestamp();
      await new Promise((r) => setTimeout(r, 10));

      await writeFile(join(tmpDir, "new.txt"), "new");
      await pipeline.processFile(
        join(tmpDir, "new.txt"),
        FileChangeType.CREATED,
      );

      const result = await provider.discover({ since: midpoint });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("new.txt");
    });

    it("filters by include patterns", async () => {
      await writeFile(join(tmpDir, "doc.md"), "# Doc");
      await writeFile(join(tmpDir, "data.txt"), "data");
      await pipeline.processDirectory(tmpDir);

      const result = await provider.discover({
        include: [".md"],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("doc.md");
    });

    it("filters by exclude patterns", async () => {
      await writeFile(join(tmpDir, "keep.txt"), "keep");
      await writeFile(join(tmpDir, "skip.txt"), "skip");
      await pipeline.processDirectory(tmpDir);

      const result = await provider.discover({
        exclude: ["skip"],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("keep.txt");
    });

    it("excludes soft-deleted artifacts", async () => {
      const filePath = join(tmpDir, "deleted.txt");
      await writeFile(filePath, "will be deleted");
      await pipeline.processFile(filePath, FileChangeType.CREATED);
      await pipeline.processFile(filePath, FileChangeType.DELETED);

      const result = await provider.discover({});
      expect(result.items).toHaveLength(0);
    });
  });

  describe("fetch", () => {
    it("fetches an existing artifact by identity", async () => {
      const filePath = join(tmpDir, "fetch-me.txt");
      await writeFile(filePath, "fetch content");
      const artifact = await pipeline.processFile(
        filePath,
        FileChangeType.CREATED,
      );

      const doc = await provider.fetch({
        uri: filePath,
        hash: artifact!.contentHash,
        discoveredAt: artifact!.createdAt,
      });

      expect(doc.title).toBe("fetch-me.txt");
      expect(doc.content).toBe("fetch content");
      expect(doc.mimeType).toBe("text/plain");
      expect(doc.identity.uri).toBe(filePath);
      expect(doc.identity.hash).toBe(artifact!.contentHash);
      expect(doc.metadata).toHaveProperty("cloudSource");
      expect(doc.metadata).toHaveProperty("relativePath");
      expect(doc.metadata).toHaveProperty("syncRoot");
      expect(doc.metadata).toHaveProperty("folderHierarchy");
      expect(doc.metadata).toHaveProperty("fileSizeBytes");
      expect(doc.metadata).toHaveProperty("syncStatus");
    });

    it("throws for nonexistent artifact", async () => {
      await expect(
        provider.fetch({
          uri: "/nonexistent",
          hash: "e".repeat(64) as ContentHash,
          discoveredAt: 0 as Timestamp,
        }),
      ).rejects.toThrow("Artifact not found");
    });
  });

  describe("list", () => {
    it("lists indexed artifacts", async () => {
      await writeFile(join(tmpDir, "list1.txt"), "one");
      await writeFile(join(tmpDir, "list2.txt"), "two");
      await pipeline.processDirectory(tmpDir);

      const result = await provider.list();
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it("supports cursor-based pagination", async () => {
      for (let i = 0; i < 25; i++) {
        await writeFile(join(tmpDir, `p${i}.txt`), `page ${i}`);
      }
      await pipeline.processDirectory(tmpDir);

      const page1 = await provider.list();
      expect(page1.items).toHaveLength(20);
      expect(page1.hasMore).toBe(true);

      const page2 = await provider.list(page1.cursor);
      expect(page2.items).toHaveLength(5);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe("health", () => {
    it("reports healthy status with artifact count", async () => {
      await writeFile(join(tmpDir, "h1.txt"), "health 1");
      await writeFile(join(tmpDir, "h2.txt"), "health 2");
      await pipeline.processDirectory(tmpDir);

      const health = await provider.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.lastChecked).toBeGreaterThan(0);
      expect(health.message).toContain("2 artifacts indexed");
    });

    it("tracks error count", async () => {
      provider.recordError();
      provider.recordError();

      const health = await provider.health();
      expect(health.message).toContain("2 errors");
    });
  });

  describe("IndexerModule.forRoot with custom store", () => {
    it("accepts a custom artifact store provider", async () => {
      const customModule = await Test.createTestingModule({
        imports: [
          IndexerModule.forRoot(
            { watchPaths: [tmpDir] },
            {
              provide: ARTIFACT_STORE,
              useClass: class {
                async findByContentHash() {
                  return null;
                }
                async findBySourceUri() {
                  return null;
                }
                async save() {}
                async markDeleted() {}
                async list() {
                  return { items: [], hasMore: false };
                }
                async findAll() {
                  return [];
                }
              },
            },
          ),
        ],
      }).compile();

      expect(customModule).toBeDefined();
      await customModule.close();
    });
  });
});
