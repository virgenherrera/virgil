import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { createTimestamp } from '../shared/primitives.js';
import type { CodeGraphResult } from './repo-metadata.schema.js';

const execFileAsync = promisify(execFile);

/** Default timeout for codegraph commands (30 seconds, as indexing can be slow). */
const CODEGRAPH_TIMEOUT_MS = 30_000;

/**
 * NestJS-injectable service that delegates structural code intelligence
 * queries to the CodeGraph CLI (`codegraph`). CodeGraph is an optional
 * development-time dependency — when unavailable on `PATH`, all query
 * methods return graceful degradation results.
 *
 * This service is intentionally **separate** from `LocalRepoProvider`:
 * Git-aware metadata (Layer 1) works without CodeGraph; structural
 * queries (Layer 2) are an optional enhancement.
 */
@Injectable()
export class CodeGraphService {
  private _codegraphPath: string | null = null;
  private _checkedAvailability = false;

  /**
   * Reports whether `codegraph` is available on PATH. The result is
   * cached after the first invocation.
   */
  async isAvailable(): Promise<boolean> {
    if (this._checkedAvailability) {
      return this._codegraphPath !== null;
    }

    this._checkedAvailability = true;

    try {
      const { stdout } = await execFileAsync('which', ['codegraph'], {
        timeout: 5_000,
        encoding: 'utf-8',
      });
      const path = stdout.trim();
      if (path) {
        this._codegraphPath = path;
        return true;
      }
    } catch {
      // codegraph not found on PATH
    }

    this._codegraphPath = null;
    return false;
  }

  /**
   * Triggers `codegraph init` to create the `.codegraph/` index for a
   * repository. Returns a result indicating success or failure.
   */
  async initIndex(repoPath: string): Promise<CodeGraphResult> {
    return this.runCodeGraph(['init', '--cwd', repoPath], repoPath);
  }

  /**
   * Checks whether a `.codegraph/` index exists and is usable for the
   * given repository path.
   */
  async hasIndex(repoPath: string): Promise<boolean> {
    try {
      await access(join(repoPath, '.codegraph'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Health check: reports whether CodeGraph is available and the index
   * exists for the given repository.
   */
  async healthCheck(repoPath: string): Promise<{
    available: boolean;
    indexed: boolean;
  }> {
    const available = await this.isAvailable();
    const indexed = available ? await this.hasIndex(repoPath) : false;
    return { available, indexed };
  }

  /**
   * Explores relevant symbols for a natural-language query, returning
   * verbatim source with call paths and blast-radius context.
   */
  async explore(repoPath: string, query: string): Promise<CodeGraphResult> {
    return this.runCodeGraph(['explore', query, '--cwd', repoPath], repoPath);
  }

  /**
   * Looks up symbols matching the query across the indexed codebase.
   */
  async querySymbols(
    repoPath: string,
    query: string,
  ): Promise<CodeGraphResult> {
    return this.runCodeGraph(['query', query, '--cwd', repoPath], repoPath);
  }

  /**
   * Returns incoming call paths to the specified symbol.
   */
  async callers(repoPath: string, symbol: string): Promise<CodeGraphResult> {
    return this.runCodeGraph(['callers', symbol, '--cwd', repoPath], repoPath);
  }

  /**
   * Returns outgoing call paths from the specified symbol.
   */
  async callees(repoPath: string, symbol: string): Promise<CodeGraphResult> {
    return this.runCodeGraph(['callees', symbol, '--cwd', repoPath], repoPath);
  }

  /**
   * Assesses the blast radius of a change to the specified symbol.
   */
  async impact(repoPath: string, symbol: string): Promise<CodeGraphResult> {
    return this.runCodeGraph(['impact', symbol, '--cwd', repoPath], repoPath);
  }

  /**
   * Determines files and symbols affected by changes to the given paths.
   */
  async affected(repoPath: string, paths: string[]): Promise<CodeGraphResult> {
    return this.runCodeGraph(
      ['affected', ...paths, '--cwd', repoPath],
      repoPath,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async runCodeGraph(
    args: string[],
    repoPath: string,
  ): Promise<CodeGraphResult> {
    const available = await this.isAvailable();
    const timestamp = createTimestamp();

    if (!available) {
      return {
        available: false,
        output: 'CodeGraph is not available on PATH',
        exitCode: -1,
        timestamp,
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync('codegraph', args, {
        cwd: repoPath,
        timeout: CODEGRAPH_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf-8',
      });
      return {
        available: true,
        output: stdout || stderr,
        exitCode: 0,
        timestamp,
      };
    } catch (error: unknown) {
      const exitCode =
        error && typeof error === 'object' && 'code' in error
          ? ((error as { code: number }).code ?? 1)
          : 1;
      const stderr =
        error && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr: string }).stderr)
          : error instanceof Error
            ? error.message
            : 'Unknown error';
      return {
        available: true,
        output: stderr,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        timestamp,
      };
    }
  }
}
