import { Test, type TestingModule } from "@nestjs/testing";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexerModule } from "../src/indexer.module.js";
import { ExtractorRegistryService } from "../src/extractor-registry.service.js";
import { ContentHasherService } from "../src/content-hasher.service.js";
import {
  PlainTextExtractor,
  StubExtractor,
} from "../src/extractor-registry.service.js";
import type { FileMetadata, ContentHash } from "../src/types.js";
import { CloudSource, SyncStatus } from "../src/types.js";

describe("ExtractorRegistry and ContentHasher (e2e)", () => {
  let module: TestingModule;
  let registry: ExtractorRegistryService;
  let hasher: ContentHasherService;
  let tmpDir: string;

  const stubMetadata: FileMetadata = {
    cloudSource: CloudSource.LOCAL,
    absolutePath: "/fake/path/file.txt",
    relativePath: "file.txt",
    syncRoot: "/fake/path",
    folderHierarchy: "/",
    fileSizeBytes: 100,
    contentHash: "a".repeat(64) as ContentHash,
    mimeType: "text/plain",
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    syncStatus: SyncStatus.UNKNOWN,
    indexedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "virgil-extractor-test-"));
    module = await Test.createTestingModule({
      imports: [IndexerModule.forRoot({ watchPaths: [tmpDir] })],
    }).compile();
    registry = module.get(ExtractorRegistryService);
    hasher = module.get(ContentHasherService);
  });

  afterEach(async () => {
    await module.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("ExtractorRegistryService", () => {
    it("registers default extractors for all supported extensions", () => {
      const extensions = registry.registeredExtensions();
      expect(extensions).toContain(".txt");
      expect(extensions).toContain(".csv");
      expect(extensions).toContain(".json");
      expect(extensions).toContain(".yaml");
      expect(extensions).toContain(".yml");
      expect(extensions).toContain(".html");
      expect(extensions).toContain(".xml");
      expect(extensions).toContain(".rtf");
      expect(extensions).toContain(".md");
      expect(extensions).toContain(".docx");
      expect(extensions).toContain(".pdf");
      expect(extensions).toContain(".xlsx");
      expect(extensions).toContain(".pptx");
    });

    it("returns undefined for unknown extension", () => {
      expect(registry.extractorFor(".xyz")).toBeUndefined();
    });

    it("returns extractor for known extension case-insensitively", () => {
      expect(registry.extractorFor(".TXT")).toBeDefined();
      expect(registry.extractorFor(".Md")).toBeDefined();
    });

    it("allows registering a custom extractor", () => {
      const custom: PlainTextExtractor = new PlainTextExtractor();
      Object.defineProperty(custom, "name", { value: "custom" });
      const customExt = {
        name: "custom-log",
        supportedExtensions: () => [".log"] as const,
        extract: custom.extract.bind(custom),
      };
      registry.register(customExt);
      expect(registry.extractorFor(".log")).toBe(customExt);
    });
  });

  describe("PlainTextExtractor", () => {
    it("extracts text from .txt files", async () => {
      const filePath = join(tmpDir, "test.txt");
      await writeFile(filePath, "Hello, world!\nLine two.");
      const extractor = registry.extractorFor(".txt")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toBe("Hello, world!\nLine two.");
      expect(result.formatMetadata).toHaveProperty("lineCount", 2);
      expect(result.formatMetadata).toHaveProperty("encoding", "utf-8");
      expect(result.extractedAt).toBeDefined();
    });

    it("extracts text from .json files", async () => {
      const filePath = join(tmpDir, "data.json");
      await writeFile(filePath, '{"key": "value"}');
      const extractor = registry.extractorFor(".json")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toBe('{"key": "value"}');
    });

    it("extracts text from .csv files", async () => {
      const filePath = join(tmpDir, "data.csv");
      await writeFile(filePath, "a,b,c\n1,2,3");
      const extractor = registry.extractorFor(".csv")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toContain("a,b,c");
    });

    it("returns error for nonexistent file", async () => {
      const extractor = registry.extractorFor(".txt")!;
      const result = await extractor.extract(
        join(tmpDir, "nonexistent.txt"),
        stubMetadata,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.text).toBe("");
    });
  });

  describe("MarkdownExtractor", () => {
    it("extracts text and headings from .md files", async () => {
      const filePath = join(tmpDir, "doc.md");
      await writeFile(
        filePath,
        "# Title\n\nParagraph.\n\n## Section\n\nMore text.",
      );
      const extractor = registry.extractorFor(".md")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toContain("# Title");
      const headings = result.formatMetadata.headings as {
        level: number;
        text: string;
      }[];
      expect(headings).toHaveLength(2);
      expect(headings[0]).toEqual({ level: 1, text: "Title" });
      expect(headings[1]).toEqual({ level: 2, text: "Section" });
    });

    it("handles markdown without headings", async () => {
      const filePath = join(tmpDir, "plain.md");
      await writeFile(filePath, "Just plain text.\nNo headings.");
      const extractor = registry.extractorFor(".md")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.formatMetadata.headings).toEqual([]);
      expect(result.formatMetadata).toHaveProperty("lineCount", 2);
    });

    it("returns error for nonexistent .md file", async () => {
      const extractor = registry.extractorFor(".md")!;
      const result = await extractor.extract(
        join(tmpDir, "missing.md"),
        stubMetadata,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("StubExtractor", () => {
    it("returns metadata-only for .docx files", async () => {
      const filePath = join(tmpDir, "doc.docx");
      await writeFile(filePath, Buffer.from("PK fake docx content"));
      const extractor = registry.extractorFor(".docx")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toBe("");
      expect(result.formatMetadata).toHaveProperty("stub", true);
      expect(result.formatMetadata).toHaveProperty("extension", ".docx");
      expect(result.formatMetadata).toHaveProperty("fileName", "doc.docx");
      expect(result.formatMetadata).toHaveProperty("fileSizeBytes");
      expect(result.formatMetadata.note).toContain("deferred");
    });

    it("returns metadata-only for .pdf files", async () => {
      const filePath = join(tmpDir, "doc.pdf");
      await writeFile(filePath, Buffer.from("%PDF-1.4 fake"));
      const extractor = registry.extractorFor(".pdf")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.text).toBe("");
      expect(result.formatMetadata).toHaveProperty("stub", true);
      expect(result.formatMetadata).toHaveProperty(
        "mimeType",
        "application/pdf",
      );
    });

    it("returns metadata-only for .xlsx files", async () => {
      const filePath = join(tmpDir, "sheet.xlsx");
      await writeFile(filePath, Buffer.from("PK fake xlsx"));
      const extractor = registry.extractorFor(".xlsx")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.formatMetadata).toHaveProperty("stub", true);
    });

    it("returns metadata-only for .pptx files", async () => {
      const filePath = join(tmpDir, "slides.pptx");
      await writeFile(filePath, Buffer.from("PK fake pptx"));
      const extractor = registry.extractorFor(".pptx")!;
      const result = await extractor.extract(filePath, {
        ...stubMetadata,
        absolutePath: filePath,
      });
      expect(result.success).toBe(true);
      expect(result.formatMetadata).toHaveProperty("stub", true);
    });

    it("uses default mime type for unknown stub extension", () => {
      const stub = new StubExtractor("test", [".zzz"], {});
      expect(stub.supportedExtensions()).toContain(".zzz");
      expect(stub.name).toBe("test");
    });
  });

  describe("ContentHasherService", () => {
    it("produces consistent SHA-256 hash for file content", async () => {
      const filePath = join(tmpDir, "hash-test.txt");
      await writeFile(filePath, "deterministic content");
      const hash1 = await hasher.hashFile(filePath);
      const hash2 = await hasher.hashFile(filePath);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for different content", async () => {
      const file1 = join(tmpDir, "a.txt");
      const file2 = join(tmpDir, "b.txt");
      await writeFile(file1, "content A");
      await writeFile(file2, "content B");
      const hash1 = await hasher.hashFile(file1);
      const hash2 = await hasher.hashFile(file2);
      expect(hash1).not.toBe(hash2);
    });

    it("hashes string content consistently", () => {
      const hash1 = hasher.hashContent("hello");
      const hash2 = hasher.hashContent("hello");
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects nonexistent file", async () => {
      await expect(
        hasher.hashFile(join(tmpDir, "missing.txt")),
      ).rejects.toThrow();
    });
  });
});
