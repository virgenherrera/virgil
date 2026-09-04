import { Test, TestingModule } from '@nestjs/testing';
import Parser from 'tree-sitter';
import { ProbeModule } from '../src/probe.module.js';
import { ReadFileService } from '../src/services/index.js';

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: mockReadFileSync };
});

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('/fake/root\n'),
}));

const TS_SNIPPET = `
export class Greeter {
  greet(name: string): string {
    return 'hello ' + name;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}
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

describe('ReadFileService edge cases (e2e)', () => {
  let moduleRef: TestingModule;
  let svc: ReadFileService;

  beforeEach(async () => {
    vi.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    svc = moduleRef.get(ReadFileService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('extracts an export_clause re-export', () => {
    mockReadFileSync.mockReturnValue(`export { foo, bar } from './other';\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('export { foo, bar }');
  });

  it('extracts a lexical declaration exported with const', () => {
    mockReadFileSync.mockReturnValue(`export const VERSION = '1.0.0';\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('export const VERSION');
  });

  it('extracts a lexical declaration with a type annotation', () => {
    mockReadFileSync.mockReturnValue(
      `export const config: Config = { host: 'x', port: 1 };\n`,
    );

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('export const config: Config');
  });

  it('extracts structural summary from a .tsx file using the TypeScript.tsx grammar', () => {
    mockReadFileSync.mockReturnValue(TS_SNIPPET);

    const result = svc.extract('/fake/component.tsx');

    expect(result).toContain('class Greeter');
    expect(result).toContain('function add');
  });

  it('extracts structural summary from a .jsx file using the JavaScript grammar', () => {
    mockReadFileSync.mockReturnValue(JS_SNIPPET);

    const result = svc.extract('/fake/component.jsx');

    expect(result).toContain('function hello');
    expect(result).toContain('class Animal');
  });

  it('extracts an import statement', () => {
    mockReadFileSync.mockReturnValue(`import { foo } from 'bar';\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain("import { foo } from 'bar';");
  });

  it('extracts a class with a typed method signature', () => {
    mockReadFileSync.mockReturnValue(
      `class Foo {\n  bar(x: number): void {}\n}\n`,
    );

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('class Foo');
    expect(result).toContain('bar(x: number): void');
  });

  it('extracts an interface with typed properties', () => {
    mockReadFileSync.mockReturnValue(
      `interface Props {\n  name: string;\n  count: number;\n}\n`,
    );

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('interface Props');
    expect(result).toContain('name: : string');
    expect(result).toContain('count: : number');
  });

  it('extracts an interface property without a type annotation', () => {
    mockReadFileSync.mockReturnValue(`interface Simple {\n  id;\n}\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('interface Simple');
    expect(result).toContain('  id');
  });

  it('returns raw content when no top-level node matches a known symbol type', () => {
    const raw = `1 + 1;\n`;
    mockReadFileSync.mockReturnValue(raw);

    const result = svc.extract('/fake/file.ts');

    expect(result).toBe(raw);
  });

  it('falls back to the first line when a default export matches no known case', () => {
    mockReadFileSync.mockReturnValue(`export default function() {}\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('export default function() {}');
  });

  it('falls back to the first line for a default export of an object literal', () => {
    mockReadFileSync.mockReturnValue(`export default { foo: 1 };\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('export default { foo: 1 };');
  });

  it('extracts a top-level (non-exported) type alias declaration', () => {
    mockReadFileSync.mockReturnValue(`type Mode = 'dev' | 'prod';\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain("type Mode = 'dev' | 'prod'");
  });

  it('extracts a top-level (non-exported) lexical declaration', () => {
    mockReadFileSync.mockReturnValue(`const total = 1;\n`);

    const result = svc.extract('/fake/file.ts');

    expect(result).toContain('const total');
  });

  it('returns raw content gracefully when tree-sitter parsing throws', () => {
    const raw = `export const VERSION = '1.0.0';\n`;
    mockReadFileSync.mockReturnValue(raw);
    const parseSpy = vi
      .spyOn(Parser.prototype, 'parse')
      .mockImplementationOnce(() => {
        throw new Error('tree-sitter boom');
      });

    const result = svc.extract('/fake/file.ts');

    expect(result).toBe(raw);
    parseSpy.mockRestore();
  });
});
