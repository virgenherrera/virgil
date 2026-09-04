import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import {
  ReadJsonService,
  CrawlDirsService,
  ReadFileService,
} from '../src/services/index.js';

const { mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  };
});

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('/fake/root\n'),
}));

// Wraps the real `quicktype` export so most calls behave exactly as they do
// in production, while individual tests can force a single call to throw in
// order to deterministically exercise ReadJsonService's fallback path.
const { mockQuicktype } = vi.hoisted(() => ({ mockQuicktype: vi.fn() }));

vi.mock('quicktype-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('quicktype-core')>();
  mockQuicktype.mockImplementation(
    (...args: Parameters<typeof actual.quicktype>) => actual.quicktype(...args),
  );
  return { ...actual, quicktype: mockQuicktype };
});

const dirEntry = (name: string) => ({
  name,
  isDirectory: () => true,
  isFile: () => false,
});

const fileEntry = (name: string) => ({
  name,
  isDirectory: () => false,
  isFile: () => true,
});

describe('Lethe services (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuicktype.mockImplementation(
      async (...args: Parameters<typeof mockQuicktype>) => {
        const actual =
          await vi.importActual<typeof import('quicktype-core')>(
            'quicktype-core',
          );
        return actual.quicktype(
          ...(args as Parameters<typeof actual.quicktype>),
        );
      },
    );

    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('ReadJsonService fallback', () => {
    it('returns the raw string when both quicktype and JSON.parse fail', async () => {
      const svc = moduleRef.get(ReadJsonService);
      const raw = 'not valid json {';

      const result = await svc.infer(raw);

      expect(result).toBe(raw);
    });

    it('returns typeof parsed for non-object JSON when quicktype fails', async () => {
      mockQuicktype.mockImplementationOnce(() => {
        throw new Error('forced quicktype failure');
      });
      const svc = moduleRef.get(ReadJsonService);

      const result = await svc.infer('true');

      expect(result).toBe('boolean');
    });

    it('returns typeof parsed for a numeric JSON root when quicktype fails', async () => {
      mockQuicktype.mockImplementationOnce(() => {
        throw new Error('forced quicktype failure');
      });
      const svc = moduleRef.get(ReadJsonService);

      const result = await svc.infer('42');

      expect(result).toBe('number');
    });

    it('returns key/type pairs for a valid object when quicktype fails', async () => {
      mockQuicktype.mockImplementationOnce(() => {
        throw new Error('forced quicktype failure');
      });
      const svc = moduleRef.get(ReadJsonService);
      const jsonContent = JSON.stringify({
        name: 'Ada',
        age: 36,
        active: true,
      });

      const result = await svc.infer(jsonContent);

      expect(result).toBe('{ name: string, age: number, active: boolean }');
    });

    it('reports array values as "array" in the fallback summary', async () => {
      mockQuicktype.mockImplementationOnce(() => {
        throw new Error('forced quicktype failure');
      });
      const svc = moduleRef.get(ReadJsonService);
      const jsonContent = JSON.stringify({ items: [1, 2], name: 'test' });

      const result = await svc.infer(jsonContent);

      expect(result).toBe('{ items: array, name: string }');
    });
  });

  describe('CrawlDirsService edge cases', () => {
    it('skips node_modules and never descends into it', () => {
      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === '/fake/project') {
          return [dirEntry('node_modules'), fileEntry('index.ts')];
        }
        return [];
      });
      mockReadFileSync.mockReturnValue('export const x = 1;');

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(result).toContain('index.ts');
      expect(result).not.toContain('node_modules');
      expect(mockReaddirSync).not.toHaveBeenCalledWith(
        '/fake/project/node_modules',
        expect.anything(),
      );
    });

    it('skips .git and never descends into it', () => {
      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === '/fake/project') {
          return [dirEntry('.git'), fileEntry('README.md')];
        }
        return [];
      });

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(result).toContain('README.md');
      expect(result).not.toContain('.git');
      expect(mockReaddirSync).not.toHaveBeenCalledWith(
        '/fake/project/.git',
        expect.anything(),
      );
    });

    it('keeps the file in the manifest with no symbols when readFile.extract throws', async () => {
      mockReaddirSync.mockReturnValue([fileEntry('broken.ts')]);
      const throwingReadFile = {
        extract: vi.fn(() => {
          throw new Error('parse failure');
        }),
      };
      const localModuleRef = await Test.createTestingModule({
        imports: [ProbeModule],
      })
        .overrideProvider(ReadFileService)
        .useValue(throwingReadFile)
        .compile();

      const svc = localModuleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(throwingReadFile.extract).toHaveBeenCalledWith(
        '/fake/project/broken.ts',
      );
      expect(result).toContain('broken.ts');
      expect(result).not.toContain('undefined');

      await localModuleRef.close();
    });

    it('lists non-JS/TS files without attempting symbol extraction', () => {
      mockReaddirSync.mockReturnValue([
        fileEntry('README.md'),
        fileEntry('data.json'),
      ]);

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(result).toContain('README.md');
      expect(result).toContain('data.json');
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('collects files from deeply nested directories', () => {
      mockReaddirSync.mockImplementation((dirPath: string) => {
        switch (dirPath) {
          case '/fake/project':
            return [dirEntry('a')];
          case '/fake/project/a':
            return [dirEntry('b')];
          case '/fake/project/a/b':
            return [dirEntry('c')];
          case '/fake/project/a/b/c':
            return [fileEntry('deep.ts')];
          default:
            return [];
        }
      });
      mockReadFileSync.mockReturnValue('export const deep = true;');

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(result).toContain('deep.ts');
      expect(result).toContain('a/b/c/ (1 files)');
    });

    it('gracefully returns an empty manifest when the directory read fails', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');

      expect(result).toBe('(empty directory)');
    });
  });
});
