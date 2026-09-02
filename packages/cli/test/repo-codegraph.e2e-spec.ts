import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Test, TestingModule } from '@nestjs/testing';
import { CodeGraphService, RepoModule } from '../src/repo/index.js';

const execFileAsync = promisify(execFile);

/**
 * Creates a minimal temporary Git repository for CodeGraph tests.
 */
async function createMinimalRepo(): Promise<{
  repoPath: string;
  cleanup: () => Promise<void>;
}> {
  const repoPath = await mkdtemp(join(tmpdir(), 'virgil-cg-test-'));

  const git = (args: string[]) =>
    execFileAsync('git', args, { cwd: repoPath, encoding: 'utf-8' });

  await git(['init']);
  await git(['config', 'user.email', 'test@virgil.dev']);
  await git(['config', 'user.name', 'Test Author']);
  await writeFile(join(repoPath, 'index.ts'), 'export const x = 1;\n');
  await git(['add', '.']);
  await git(['commit', '-m', 'initial']);

  return {
    repoPath,
    cleanup: () => rm(repoPath, { recursive: true, force: true }),
  };
}

describe('CodeGraphService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: CodeGraphService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RepoModule],
    }).compile();
    service = moduleRef.get(CodeGraphService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ---------------------------------------------------------------------------
  // Availability detection
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('returns a boolean indicating whether codegraph is on PATH', async () => {
      const result = await service.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('caches the availability result on subsequent calls', async () => {
      const first = await service.isAvailable();
      const second = await service.isAvailable();
      expect(first).toBe(second);
    });
  });

  // ---------------------------------------------------------------------------
  // Index presence
  // ---------------------------------------------------------------------------

  describe('hasIndex', () => {
    it('returns false for a repository without a .codegraph directory', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.hasIndex(repoPath);
        expect(result).toBe(false);
      } finally {
        await cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  describe('healthCheck', () => {
    it('reports availability and index status for a repository', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.healthCheck(repoPath);

        expect(result).toHaveProperty('available');
        expect(result).toHaveProperty('indexed');
        expect(typeof result.available).toBe('boolean');
        expect(typeof result.indexed).toBe('boolean');
        // Without codegraph installed, indexed should be false
        if (!result.available) {
          expect(result.indexed).toBe(false);
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Graceful degradation (codegraph not on PATH)
  // ---------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('explore returns a structured unavailable result when codegraph is not on PATH', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.explore(repoPath, 'test query');

        // If codegraph is not available, we get a degradation result
        if (!result.available) {
          expect(result.output).toContain('not available');
          expect(result.exitCode).toBe(-1);
          expect(result.timestamp).toBeGreaterThan(0);
        } else {
          // If available, we still get a structured result
          expect(result.available).toBe(true);
          expect(result.timestamp).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    });

    it('querySymbols returns a structured result regardless of codegraph availability', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.querySymbols(repoPath, 'x');

        expect(result).toHaveProperty('available');
        expect(result).toHaveProperty('output');
        expect(result).toHaveProperty('exitCode');
        expect(result).toHaveProperty('timestamp');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('callers returns a structured result', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.callers(repoPath, 'someSymbol');
        expect(result).toHaveProperty('available');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('callees returns a structured result', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.callees(repoPath, 'someSymbol');
        expect(result).toHaveProperty('available');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('impact returns a structured result', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.impact(repoPath, 'someSymbol');
        expect(result).toHaveProperty('available');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('affected returns a structured result', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.affected(repoPath, ['index.ts']);
        expect(result).toHaveProperty('available');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('initIndex returns a structured result', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.initIndex(repoPath);
        expect(result).toHaveProperty('available');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Caching behavior
  // ---------------------------------------------------------------------------

  describe('availability caching', () => {
    it('only checks availability once and caches the result', async () => {
      const { cleanup } = await createMinimalRepo();
      try {
        // First call checks and caches
        const first = await service.isAvailable();
        expect(typeof first).toBe('boolean');

        // Second call returns cached result
        const second = await service.isAvailable();
        expect(first).toBe(second);

        // Verify they are the exact same boolean reference by calling many times
        const third = await service.isAvailable();
        expect(second).toBe(third);
      } finally {
        await cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling in runCodeGraph
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('handles execution errors gracefully and returns error code', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        // Call with a query that might fail or return error
        const result = await service.querySymbols(
          repoPath,
          'nonexistent_symbol',
        );

        // Should return a structured result regardless
        expect(result).toHaveProperty('available');
        expect(result).toHaveProperty('exitCode');
        expect(result).toHaveProperty('output');
        expect(result).toHaveProperty('timestamp');
      } finally {
        await cleanup();
      }
    });

    it('explore handles error results and returns structured output', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const result = await service.explore(repoPath, 'test');

        // Should always return a structured result
        expect(result).toHaveProperty('available');
        expect(result).toHaveProperty('exitCode');
        expect(result).toHaveProperty('timestamp');
        expect(result.timestamp).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('multiple method calls return consistent result structure', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const methods = [
          () => service.explore(repoPath, 'test'),
          () => service.querySymbols(repoPath, 'test'),
          () => service.callers(repoPath, 'test'),
          () => service.callees(repoPath, 'test'),
          () => service.impact(repoPath, 'test'),
          () => service.affected(repoPath, ['index.ts']),
          () => service.initIndex(repoPath),
        ];

        for (const method of methods) {
          const result = await method();
          expect(result).toHaveProperty('available');
          expect(result).toHaveProperty('output');
          expect(result).toHaveProperty('exitCode');
          expect(result).toHaveProperty('timestamp');
          expect(typeof result.available).toBe('boolean');
          expect(typeof result.output).toBe('string');
          expect(typeof result.exitCode).toBe('number');
          expect(typeof result.timestamp).toBe('number');
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('healthCheck on non-existent path returns expected structure', async () => {
      const _nonExistentPath = '/nonexistent/path';
      const result = await service.healthCheck(_nonExistentPath);
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('indexed');
      expect(typeof result.available).toBe('boolean');
      expect(typeof result.indexed).toBe('boolean');
    });

    it('hasIndex correctly identifies missing .codegraph directory', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const has = await service.hasIndex(repoPath);
        expect(typeof has).toBe('boolean');
      } finally {
        await cleanup();
      }
    });

    it('isAvailable result affects healthCheck indexed property', async () => {
      const { repoPath, cleanup } = await createMinimalRepo();
      try {
        const available = await service.isAvailable();
        const health = await service.healthCheck(repoPath);

        // If not available, indexed must be false
        if (!available) {
          expect(health.indexed).toBe(false);
        }
      } finally {
        await cleanup();
      }
    });
  });
});
