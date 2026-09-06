import {
  LocalRepoConfigEntrySchema,
  LocalRepoConfigSchema,
} from '../../src/repo/repo-config.schema.js';

describe('LocalRepoConfigEntrySchema', () => {
  it('parses valid entry with defaults', () => {
    const result = LocalRepoConfigEntrySchema.parse({ path: '/home/user/repo' });
    expect(result.path).toBe('/home/user/repo');
    expect(result.maxCommits).toBe(20);
    expect(result.maxFiles).toBe(1000);
    expect(result.maxFileSize).toBe(102_400);
    expect(result.alias).toBeUndefined();
  });

  it('parses entry with all fields', () => {
    const result = LocalRepoConfigEntrySchema.parse({
      path: '/home/user/repo',
      alias: 'my-repo',
      maxCommits: 50,
      maxFiles: 500,
      maxFileSize: 204_800,
    });
    expect(result.alias).toBe('my-repo');
    expect(result.maxCommits).toBe(50);
    expect(result.maxFiles).toBe(500);
    expect(result.maxFileSize).toBe(204_800);
  });

  it('rejects empty path', () => {
    expect(() => LocalRepoConfigEntrySchema.parse({ path: '' })).toThrow();
  });

  it('rejects relative path', () => {
    expect(() =>
      LocalRepoConfigEntrySchema.parse({ path: 'relative/path' }),
    ).toThrow();
  });

  it('rejects empty alias', () => {
    expect(() =>
      LocalRepoConfigEntrySchema.parse({ path: '/repo', alias: '' }),
    ).toThrow();
  });

  it('rejects non-positive maxCommits', () => {
    expect(() =>
      LocalRepoConfigEntrySchema.parse({ path: '/repo', maxCommits: 0 }),
    ).toThrow();
  });

  it('rejects non-positive maxFiles', () => {
    expect(() =>
      LocalRepoConfigEntrySchema.parse({ path: '/repo', maxFiles: -1 }),
    ).toThrow();
  });

  it('rejects non-positive maxFileSize', () => {
    expect(() =>
      LocalRepoConfigEntrySchema.parse({ path: '/repo', maxFileSize: 0 }),
    ).toThrow();
  });
});

describe('LocalRepoConfigSchema', () => {
  it('parses valid config with one repository', () => {
    const result = LocalRepoConfigSchema.parse({
      repositories: [{ path: '/home/user/repo' }],
    });
    expect(result.repositories).toHaveLength(1);
  });

  it('parses config with multiple repositories', () => {
    const result = LocalRepoConfigSchema.parse({
      repositories: [
        { path: '/home/user/repo1' },
        { path: '/home/user/repo2', alias: 'second' },
      ],
    });
    expect(result.repositories).toHaveLength(2);
  });

  it('rejects empty repositories array', () => {
    expect(() =>
      LocalRepoConfigSchema.parse({ repositories: [] }),
    ).toThrow();
  });
});
