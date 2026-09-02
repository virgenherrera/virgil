import { Injectable } from "@nestjs/common";
import { sep } from "node:path";
import { CloudSource, SyncStatus } from "./types.js";

export interface CloudSourceResult {
  readonly source: CloudSource;
  readonly syncRoot: string;
  readonly relativePath: string;
  readonly syncStatus: SyncStatus;
}

const GOOGLE_DRIVE_PATTERNS: RegExp[] = [
  /^(.*\/Library\/CloudStorage\/GoogleDrive-[^/]+\/My Drive)\//,
  /^(.*\/Google Drive\/My Drive)\//,
  /^(.*\/Google Drive)\//,
];

const ONEDRIVE_PATTERNS: RegExp[] = [
  /^(.*\/Library\/CloudStorage\/OneDrive-[^/]+)\//,
  /^(.*\/OneDrive - [^/]+)\//,
  /^(.*\/OneDrive)\//,
];

@Injectable()
export class CloudSourceDetectorService {
  detect(absolutePath: string, watchRoot?: string): CloudSourceResult {
    const normalized = absolutePath.replace(/\\/g, "/");

    for (const pattern of GOOGLE_DRIVE_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        return {
          source: CloudSource.GOOGLE_DRIVE,
          syncRoot: match[1],
          relativePath: normalized.slice(match[1].length + 1),
          syncStatus: SyncStatus.SYNCED,
        };
      }
    }

    for (const pattern of ONEDRIVE_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        return {
          source: CloudSource.ONEDRIVE,
          syncRoot: match[1],
          relativePath: normalized.slice(match[1].length + 1),
          syncStatus: SyncStatus.SYNCED,
        };
      }
    }

    const root = watchRoot ?? this.parentDirectory(absolutePath);
    const relPath = absolutePath.startsWith(root + sep)
      ? absolutePath.slice(root.length + 1)
      : absolutePath.startsWith(root + "/")
        ? absolutePath.slice(root.length + 1)
        : absolutePath;

    return {
      source: CloudSource.LOCAL,
      syncRoot: root,
      relativePath: relPath,
      syncStatus: SyncStatus.UNKNOWN,
    };
  }

  private parentDirectory(filePath: string): string {
    const lastSep = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    return lastSep > 0 ? filePath.slice(0, lastSep) : filePath;
  }
}
