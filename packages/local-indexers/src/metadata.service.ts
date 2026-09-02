import { Injectable } from "@nestjs/common";
import { stat } from "node:fs/promises";
import { extname, dirname } from "node:path";
import { CloudSourceDetectorService } from "./cloud-source-detector.service.js";
import type { ContentHash, FileMetadata } from "./types.js";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".html": "text/html",
  ".xml": "application/xml",
  ".rtf": "application/rtf",
  ".md": "text/markdown",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ts": "text/typescript",
  ".js": "text/javascript",
  ".py": "text/x-python",
};

@Injectable()
export class MetadataService {
  constructor(private readonly cloudDetector: CloudSourceDetectorService) {}

  async buildMetadata(
    absolutePath: string,
    contentHash: ContentHash,
    watchRoot?: string,
  ): Promise<FileMetadata> {
    const fileStats = await stat(absolutePath);
    const ext = extname(absolutePath).toLowerCase();
    const detection = this.cloudDetector.detect(absolutePath, watchRoot);

    return {
      cloudSource: detection.source,
      absolutePath,
      relativePath: detection.relativePath,
      syncRoot: detection.syncRoot,
      folderHierarchy: this.buildFolderHierarchy(detection.relativePath),
      fileSizeBytes: fileStats.size,
      contentHash,
      mimeType: MIME_TYPES[ext] ?? "application/octet-stream",
      createdAt: fileStats.birthtime.toISOString(),
      modifiedAt: fileStats.mtime.toISOString(),
      syncStatus: detection.syncStatus,
      indexedAt: new Date().toISOString(),
    };
  }

  resolveMimeType(extension: string): string {
    return MIME_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
  }

  private buildFolderHierarchy(relativePath: string): string {
    const dir = dirname(relativePath);
    if (dir === "." || dir === "") return "/";
    return dir.startsWith("/") ? dir : `/${dir}`;
  }
}
