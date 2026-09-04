import { Injectable } from '@nestjs/common';
import { readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { ReadFileService } from './read-file.service.js';

interface FileEntry {
  relativePath: string;
  symbols: string | null;
}

@Injectable()
export class CrawlDirsService {
  constructor(private readonly readFile: ReadFileService) {}

  manifest(dirPath: string): string {
    const entries = this.collectFiles(dirPath, dirPath);
    return this.formatManifest(entries);
  }

  private collectFiles(basePath: string, currentPath: string): FileEntry[] {
    const entries: FileEntry[] = [];
    try {
      const dirEntries = readdirSync(currentPath, { withFileTypes: true });
      for (const entry of dirEntries) {
        const name = String(entry.name);
        const fullPath = join(currentPath, name);
        if (entry.isDirectory()) {
          if (
            ['node_modules', '.git', 'dist', 'coverage', '.next'].includes(name)
          )
            continue;
          entries.push(...this.collectFiles(basePath, fullPath));
        } else if (entry.isFile()) {
          const rel = relative(basePath, fullPath);
          const ext = extname(name).toLowerCase();
          let symbols: string | null = null;
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            try {
              symbols = this.readFile.extract(fullPath);
            } catch {
              symbols = null;
            }
          }
          entries.push({ relativePath: rel, symbols });
        }
      }
    } catch {
      // empty dir or permission error
    }
    return entries;
  }

  private formatManifest(entries: FileEntry[]): string {
    if (entries.length === 0) return '(empty directory)';
    const groups = new Map<string, FileEntry[]>();
    for (const entry of entries) {
      const dir = entry.relativePath.includes('/')
        ? entry.relativePath.substring(0, entry.relativePath.lastIndexOf('/'))
        : '.';
      const existing = groups.get(dir) ?? [];
      existing.push(entry);
      groups.set(dir, existing);
    }
    const lines: string[] = [];
    for (const [dir, files] of groups) {
      lines.push(`${dir}/ (${files.length} files)`);
      for (const file of files) {
        const fileName = file.relativePath.includes('/')
          ? file.relativePath.substring(file.relativePath.lastIndexOf('/') + 1)
          : file.relativePath;
        if (file.symbols) {
          const symbolLines = file.symbols.split('\n').filter((l) => l.trim());
          lines.push(`  ${fileName}`);
          for (const sl of symbolLines) {
            lines.push(`    ${sl}`);
          }
        } else {
          lines.push(`  ${fileName}`);
        }
      }
    }
    return lines.join('\n');
  }
}
