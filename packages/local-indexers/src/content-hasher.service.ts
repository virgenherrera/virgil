import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createContentHash } from "./types.js";
import type { ContentHash } from "./types.js";

@Injectable()
export class ContentHasherService {
  /**
   * Computes SHA-256 hash of a file using streaming to handle large files
   * without loading them entirely into memory.
   */
  async hashFile(filePath: string): Promise<ContentHash> {
    return new Promise<ContentHash>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex") as ContentHash));
      stream.on("error", reject);
    });
  }

  /** Computes SHA-256 hash of a string content. */
  hashContent(content: string): ContentHash {
    return createContentHash(content);
  }
}
