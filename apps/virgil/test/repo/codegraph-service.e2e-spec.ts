import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Test, TestingModule } from '@nestjs/testing';
import { CodeGraphService } from '../../src/repo/codegraph.service.js';

const execFileAsync = promisify(execFile);

describe('CodeGraphService', () => {
  let service: CodeGraphService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CodeGraphService],
    }).compile();
    service = module.get(CodeGraphService);
  });

  describe('isAvailable', () => {
    it('returns a boolean', async () => {
      const result = await service.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('caches availability after first call', async () => {
      const first = await service.isAvailable();
      const second = await service.isAvailable();
      expect(first).toBe(second);
    });
  });

  describe('hasIndex', () => {
    it('returns false for a path without .codegraph', async () => {
      const dir = join(tmpdir(), `virgil-cg-test-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      try {
        const result = await service.hasIndex(dir);
        expect(result).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns true when .codegraph directory exists', async () => {
      const dir = join(tmpdir(), `virgil-cg-test-idx-${Date.now()}`);
      await mkdir(join(dir, '.codegraph'), { recursive: true });
      try {
        const result = await service.hasIndex(dir);
        expect(result).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('healthCheck', () => {
    it('returns available and indexed status', async () => {
      const dir = join(tmpdir(), `virgil-cg-health-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      try {
        const result = await service.healthCheck(dir);
        expect(result).toHaveProperty('available');
        expect(result).toHaveProperty('indexed');
        expect(typeof result.available).toBe('boolean');
        expect(typeof result.indexed).toBe('boolean');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('runCodeGraph error handling', () => {
    it('handles command failure with exit code', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      // Point to a command that exists but will fail
      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = '/usr/bin/false';

      // Calling explore with codegraph "available" but failing binary
      // triggers the catch path in runCodeGraph
      const result = await freshService.explore('/tmp', 'test');
      expect(result.available).toBe(true);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toBeTruthy();
    });
  });

  describe('graceful degradation', () => {
    it('explore returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      // Force unavailability by setting internal state
      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.explore('/tmp', 'test query');
      expect(result.available).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.output).toContain('not available');
    });

    it('querySymbols returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.querySymbols('/tmp', 'someSymbol');
      expect(result.available).toBe(false);
      expect(result.exitCode).toBe(-1);
    });

    it('callers returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.callers('/tmp', 'MyClass');
      expect(result.available).toBe(false);
    });

    it('callees returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.callees('/tmp', 'MyClass');
      expect(result.available).toBe(false);
    });

    it('impact returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.impact('/tmp', 'MyClass');
      expect(result.available).toBe(false);
    });

    it('affected returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.affected('/tmp', ['file.ts']);
      expect(result.available).toBe(false);
    });

    it('initIndex returns unavailable result when codegraph not on PATH', async () => {
      const freshModule = await Test.createTestingModule({
        providers: [CodeGraphService],
      }).compile();
      const freshService = freshModule.get(CodeGraphService);

      (freshService as any)._checkedAvailability = true;
      (freshService as any)._codegraphPath = null;

      const result = await freshService.initIndex('/tmp');
      expect(result.available).toBe(false);
    });
  });
});
