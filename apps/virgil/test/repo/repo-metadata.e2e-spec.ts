import {
  CommitEntrySchema,
  ContributorSchema,
  DetailedStatusSchema,
  RemoteEntrySchema,
  CodeGraphResultSchema,
} from '../../src/repo/repo-metadata.schema.js';
import { createTimestamp } from '../../src/shared/primitives.js';

describe('CommitEntrySchema', () => {
  it('parses valid commit entry', () => {
    const result = CommitEntrySchema.parse({
      sha: 'abc123',
      authorName: 'Test User',
      authorEmail: 'test@example.com',
      date: '2025-01-01T00:00:00Z',
      subject: 'initial commit',
    });
    expect(result.sha).toBe('abc123');
    expect(result.subject).toBe('initial commit');
  });

  it('allows empty subject', () => {
    const result = CommitEntrySchema.parse({
      sha: 'abc123',
      authorName: 'Test User',
      authorEmail: 'test@example.com',
      date: '2025-01-01T00:00:00Z',
      subject: '',
    });
    expect(result.subject).toBe('');
  });

  it('rejects empty sha', () => {
    expect(() =>
      CommitEntrySchema.parse({
        sha: '',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        date: '2025-01-01',
        subject: 'msg',
      }),
    ).toThrow();
  });

  it('rejects empty authorName', () => {
    expect(() =>
      CommitEntrySchema.parse({
        sha: 'abc',
        authorName: '',
        authorEmail: 'test@example.com',
        date: '2025-01-01',
        subject: 'msg',
      }),
    ).toThrow();
  });

  it('rejects empty authorEmail', () => {
    expect(() =>
      CommitEntrySchema.parse({
        sha: 'abc',
        authorName: 'Test',
        authorEmail: '',
        date: '2025-01-01',
        subject: 'msg',
      }),
    ).toThrow();
  });

  it('rejects empty date', () => {
    expect(() =>
      CommitEntrySchema.parse({
        sha: 'abc',
        authorName: 'Test',
        authorEmail: 'test@example.com',
        date: '',
        subject: 'msg',
      }),
    ).toThrow();
  });
});

describe('ContributorSchema', () => {
  it('parses valid contributor', () => {
    const result = ContributorSchema.parse({
      name: 'Test User',
      email: 'test@example.com',
      commitCount: 5,
    });
    expect(result.commitCount).toBe(5);
  });

  it('rejects zero commitCount', () => {
    expect(() =>
      ContributorSchema.parse({
        name: 'Test',
        email: 'test@example.com',
        commitCount: 0,
      }),
    ).toThrow();
  });

  it('rejects negative commitCount', () => {
    expect(() =>
      ContributorSchema.parse({
        name: 'Test',
        email: 'test@example.com',
        commitCount: -1,
      }),
    ).toThrow();
  });
});

describe('DetailedStatusSchema', () => {
  it('parses clean status', () => {
    const result = DetailedStatusSchema.parse({
      clean: true,
      modified: 0,
      staged: 0,
      untracked: 0,
      conflicted: 0,
    });
    expect(result.clean).toBe(true);
  });

  it('parses dirty status with counts', () => {
    const result = DetailedStatusSchema.parse({
      clean: false,
      modified: 2,
      staged: 1,
      untracked: 3,
      conflicted: 0,
    });
    expect(result.modified).toBe(2);
    expect(result.staged).toBe(1);
    expect(result.untracked).toBe(3);
  });

  it('rejects negative counts', () => {
    expect(() =>
      DetailedStatusSchema.parse({
        clean: true,
        modified: -1,
        staged: 0,
        untracked: 0,
        conflicted: 0,
      }),
    ).toThrow();
  });
});

describe('RemoteEntrySchema', () => {
  it('parses valid remote', () => {
    const result = RemoteEntrySchema.parse({
      name: 'origin',
      url: 'https://github.com/org/repo.git',
    });
    expect(result.name).toBe('origin');
    expect(result.url).toBe('https://github.com/org/repo.git');
  });

  it('rejects empty name', () => {
    expect(() =>
      RemoteEntrySchema.parse({ name: '', url: 'https://example.com' }),
    ).toThrow();
  });

  it('rejects empty url', () => {
    expect(() =>
      RemoteEntrySchema.parse({ name: 'origin', url: '' }),
    ).toThrow();
  });
});

describe('CodeGraphResultSchema', () => {
  it('parses available result', () => {
    const result = CodeGraphResultSchema.parse({
      available: true,
      output: 'some output',
      exitCode: 0,
      timestamp: createTimestamp(),
    });
    expect(result.available).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('parses unavailable result', () => {
    const result = CodeGraphResultSchema.parse({
      available: false,
      output: 'CodeGraph is not available on PATH',
      exitCode: -1,
      timestamp: createTimestamp(),
    });
    expect(result.available).toBe(false);
    expect(result.exitCode).toBe(-1);
  });
});
