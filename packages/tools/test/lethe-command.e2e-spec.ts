import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { LetheCommand } from '../src/commands/index.js';
import {
  LetheConfigService,
  ReadFileService,
  ReadJsonService,
  CrawlDirsService,
} from '../src/services/index.js';
import type { LetheConfig } from '../src/schemas/index.js';

const { mockReadFileSync, mockReaddirSync, mockExistsSync, mockWriteFileSync } =
  vi.hoisted(() => ({
    mockReadFileSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockWriteFileSync: vi.fn(),
  }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
  };
});

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('/fake/root\n'),
}));

const enabledConfig: LetheConfig = {
  enabled: true,
  tasks: {
    readFile: true,
    readJson: true,
    crawlDirs: true,
    rawInput: true,
    phaseOutput: true,
  },
};

const disabledConfig: LetheConfig = {
  enabled: false,
  tasks: {
    readFile: true,
    readJson: true,
    crawlDirs: true,
    rawInput: true,
    phaseOutput: true,
  },
};

const TS_SNIPPET = `
export class Greeter {
  greet(name: string): string {
    return 'hello ' + name;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}

export interface Config {
  host: string;
  port: number;
}

export type Mode = 'dev' | 'prod';
`;

const JS_SNIPPET = `
function hello(name) {
  return 'hi ' + name;
}

class Animal {
  speak() {
    return 'woof';
  }
}
`;

const JSON_SAMPLE = JSON.stringify({
  name: 'test',
  age: 30,
  active: true,
  items: [1, 2, 3],
});

describe('Lethe (e2e)', () => {
  let moduleRef: TestingModule;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const mockLetheConfig = { load: vi.fn<() => LetheConfig>() };

  beforeEach(async () => {
    vi.clearAllMocks();

    moduleRef = await Test.createTestingModule({ imports: [ProbeModule] })
      .overrideProvider(LetheConfigService)
      .useValue(mockLetheConfig)
      .compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await moduleRef.close();
  });

  it('resolves LetheCommand from DI', () => {
    const cmd = moduleRef.get(LetheCommand);
    expect(cmd).toBeDefined();
  });

  describe('ReadFileService', () => {
    it('extracts structural summary from TypeScript', () => {
      mockReadFileSync.mockReturnValue(TS_SNIPPET);
      const svc = moduleRef.get(ReadFileService);
      const result = svc.extract('/fake/file.ts');
      expect(result).toContain('class Greeter');
      expect(result).toContain('function add');
      expect(result).toContain('interface Config');
      expect(result).toContain('type Mode');
    });

    it('extracts from JavaScript', () => {
      mockReadFileSync.mockReturnValue(JS_SNIPPET);
      const svc = moduleRef.get(ReadFileService);
      const result = svc.extract('/fake/file.js');
      expect(result).toContain('function hello');
      expect(result).toContain('class Animal');
    });

    it('returns raw content for unsupported extensions', () => {
      const raw = '# Hello World\nSome markdown content';
      mockReadFileSync.mockReturnValue(raw);
      const svc = moduleRef.get(ReadFileService);
      const result = svc.extract('/fake/file.md');
      expect(result).toBe(raw);
    });
  });

  describe('ReadJsonService', () => {
    it('infers TypeScript interfaces from JSON', async () => {
      const svc = moduleRef.get(ReadJsonService);
      const result = await svc.infer(JSON_SAMPLE);
      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result).toContain('items');
    });
  });

  describe('CrawlDirsService', () => {
    it('builds directory manifest', () => {
      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === '/fake/project') {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils', isDirectory: () => true, isFile: () => false },
          ];
        }
        if (dirPath === '/fake/project/utils') {
          return [
            { name: 'helper.ts', isDirectory: () => false, isFile: () => true },
          ];
        }
        return [];
      });
      mockReadFileSync.mockReturnValue('export function util(): void {}');

      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/project');
      expect(result).toContain('index.ts');
      expect(result).toContain('helper.ts');
      expect(result).toContain('files)');
    });

    it('returns empty directory message for empty dirs', () => {
      mockReaddirSync.mockReturnValue([]);
      const svc = moduleRef.get(CrawlDirsService);
      const result = svc.manifest('/fake/empty');
      expect(result).toBe('(empty directory)');
    });
  });

  describe('LetheCommand', () => {
    it('outputs raw content when lethe.enabled is false', async () => {
      mockLetheConfig.load.mockReturnValue(disabledConfig);
      mockReadFileSync.mockReturnValue('raw file content');

      const cmd = moduleRef.get(LetheCommand);
      await cmd.run([], { task: 'readFile', input: '/fake/file.ts' });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('lethe.enabled is false'),
      );
      expect(logSpy).toHaveBeenCalled();
      const output = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(output.output).toBe('raw file content');
    });

    it('outputs raw content when specific task is disabled', async () => {
      mockLetheConfig.load.mockReturnValue({
        enabled: true,
        tasks: {
          readFile: false,
          readJson: true,
          crawlDirs: true,
          rawInput: true,
          phaseOutput: true,
        },
      });
      mockReadFileSync.mockReturnValue('raw ts content');

      const cmd = moduleRef.get(LetheCommand);
      await cmd.run([], { task: 'readFile', input: '/fake/file.ts' });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('lethe.tasks.readFile is disabled'),
      );
      const output = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(output.output).toBe('raw ts content');
    });

    it('rejects rawInput with error directing to delegate', async () => {
      const cmd = moduleRef.get(LetheCommand);
      await expect(
        cmd.run([], { task: 'rawInput', input: '/fake' }),
      ).rejects.toThrow('process.exit');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Use pnpm delegate for LLM tasks'),
      );
    });

    it('rejects phaseOutput with error directing to delegate', async () => {
      const cmd = moduleRef.get(LetheCommand);
      await expect(
        cmd.run([], { task: 'phaseOutput', input: '/fake' }),
      ).rejects.toThrow('process.exit');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Use pnpm delegate for LLM tasks'),
      );
    });

    it('outputs structural extraction when readFile is enabled', async () => {
      mockLetheConfig.load.mockReturnValue(enabledConfig);
      mockReadFileSync.mockReturnValue(TS_SNIPPET);

      const cmd = moduleRef.get(LetheCommand);
      await cmd.run([], { task: 'readFile', input: '/fake/file.ts' });

      expect(logSpy).toHaveBeenCalled();
      const output = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(output.task).toBe('readFile');
      expect(output.output).toContain('class Greeter');
      expect(output.output).toContain('function add');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('outputs schema inference when readJson is enabled', async () => {
      mockLetheConfig.load.mockReturnValue(enabledConfig);
      mockReadFileSync.mockReturnValue(JSON_SAMPLE);

      const cmd = moduleRef.get(LetheCommand);
      await cmd.run([], { task: 'readJson', input: '/fake/data.json' });

      expect(logSpy).toHaveBeenCalled();
      const output = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(output.task).toBe('readJson');
      expect(output.output).toContain('name');
    });

    it('outputs directory manifest when crawlDirs is enabled', async () => {
      mockLetheConfig.load.mockReturnValue(enabledConfig);
      mockReaddirSync.mockReturnValue([
        { name: 'app.ts', isDirectory: () => false, isFile: () => true },
      ]);
      mockReadFileSync.mockReturnValue('export const APP = "test";');

      const cmd = moduleRef.get(LetheCommand);
      await cmd.run([], { task: 'crawlDirs', input: '/fake/src' });

      expect(logSpy).toHaveBeenCalled();
      const output = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(output.task).toBe('crawlDirs');
      expect(output.output).toContain('app.ts');
    });
  });

  describe('Option parsers', () => {
    it('parseTask validates task type', () => {
      const cmd = moduleRef.get(LetheCommand);
      expect(cmd.parseTask('readFile')).toBe('readFile');
      expect(cmd.parseTask('crawlDirs')).toBe('crawlDirs');
    });

    it('parseTask rejects invalid task type', () => {
      const cmd = moduleRef.get(LetheCommand);
      expect(() => cmd.parseTask('invalidTask')).toThrow();
    });

    it('parseInput returns the path unchanged', () => {
      const cmd = moduleRef.get(LetheCommand);
      expect(cmd.parseInput('/some/path')).toBe('/some/path');
    });
  });
});
