import { Injectable } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import { extname, basename } from "node:path";
import type {
  ContentExtractor,
  ExtractionResult,
  FileMetadata,
} from "./types.js";

// ── Plain Text Extractor ────────────────────────────────────────────

export class PlainTextExtractor implements ContentExtractor {
  readonly name = "plain-text";

  supportedExtensions(): readonly string[] {
    return [".txt", ".csv", ".json", ".yaml", ".yml", ".html", ".xml", ".rtf"];
  }

  async extract(
    filePath: string,
    _metadata: FileMetadata,
  ): Promise<ExtractionResult> {
    try {
      const text = await readFile(filePath, "utf-8");
      const lines = text.split("\n");
      return {
        text,
        formatMetadata: {
          lineCount: lines.length,
          encoding: "utf-8",
          extension: extname(filePath),
        },
        extractedAt: new Date().toISOString(),
        success: true,
      };
    } catch (error) {
      return {
        text: "",
        formatMetadata: {},
        extractedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ── Markdown Extractor ──────────────────────────────────────────────

export class MarkdownExtractor implements ContentExtractor {
  readonly name = "markdown";

  supportedExtensions(): readonly string[] {
    return [".md"];
  }

  async extract(
    filePath: string,
    _metadata: FileMetadata,
  ): Promise<ExtractionResult> {
    try {
      const text = await readFile(filePath, "utf-8");
      const headings = text
        .split("\n")
        .filter((line) => /^#{1,6}\s/.test(line))
        .map((line) => {
          const match = line.match(/^(#{1,6})\s+(.*)/);
          return match
            ? { level: match[1].length, text: match[2].trim() }
            : null;
        })
        .filter(Boolean);
      return {
        text,
        formatMetadata: {
          headings,
          lineCount: text.split("\n").length,
          extension: ".md",
        },
        extractedAt: new Date().toISOString(),
        success: true,
      };
    } catch (error) {
      return {
        text: "",
        formatMetadata: {},
        extractedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ── Stub Extractor (metadata-only for binary formats) ───────────────

export class StubExtractor implements ContentExtractor {
  readonly name: string;
  private readonly extensions: readonly string[];
  private readonly mimeTypes: ReadonlyMap<string, string>;

  constructor(
    name: string,
    extensions: string[],
    mimeTypes: Record<string, string>,
  ) {
    this.name = name;
    this.extensions = extensions;
    this.mimeTypes = new Map(Object.entries(mimeTypes));
  }

  supportedExtensions(): readonly string[] {
    return this.extensions;
  }

  async extract(
    filePath: string,
    _metadata: FileMetadata,
  ): Promise<ExtractionResult> {
    const ext = extname(filePath).toLowerCase();
    const fileStats = await stat(filePath);
    return {
      text: "",
      formatMetadata: {
        stub: true,
        extension: ext,
        mimeType: this.mimeTypes.get(ext) ?? "application/octet-stream",
        fileSizeBytes: fileStats.size,
        fileName: basename(filePath),
        note: `Content extraction for ${ext} is deferred. Metadata-only artifact.`,
      },
      extractedAt: new Date().toISOString(),
      success: true,
    };
  }
}

// ── Extractor Registry ──────────────────────────────────────────────

@Injectable()
export class ExtractorRegistryService {
  private readonly extractors = new Map<string, ContentExtractor>();

  constructor() {
    this.registerDefaults();
  }

  register(extractor: ContentExtractor): void {
    for (const ext of extractor.supportedExtensions()) {
      this.extractors.set(ext.toLowerCase(), extractor);
    }
  }

  extractorFor(extension: string): ContentExtractor | undefined {
    return this.extractors.get(extension.toLowerCase());
  }

  registeredExtensions(): readonly string[] {
    return [...this.extractors.keys()];
  }

  private registerDefaults(): void {
    this.register(new PlainTextExtractor());
    this.register(new MarkdownExtractor());
    this.register(
      new StubExtractor("docx", [".docx"], {
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    this.register(
      new StubExtractor("pdf", [".pdf"], {
        ".pdf": "application/pdf",
      }),
    );
    this.register(
      new StubExtractor("xlsx", [".xlsx"], {
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    this.register(
      new StubExtractor("pptx", [".pptx"], {
        ".pptx":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );
  }
}
