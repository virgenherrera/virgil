import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PersistenceModule,
  SourceRepository,
} from '../src/persistence/index.js';

/**
 * Exercises the on-disk (non-`:memory:`) database path: directory
 * creation and migration application against a real SQLite file, the
 * path every production/CLI invocation actually takes.
 */
describe('File-backed database connection (e2e)', () => {
  let tempDir: string;
  let databasePath: string;
  let moduleRef: TestingModule;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'virgil-persistence-'));
    // Nested, not-yet-existing subdirectory — exercises the
    // `mkdirSync(directory, { recursive: true })` branch.
    databasePath = join(tempDir, 'nested', 'knowledge.db');
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the parent directory and the database file, and applies migrations', async () => {
    expect(existsSync(databasePath)).toBe(false);

    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath })],
    }).compile();

    expect(existsSync(databasePath)).toBe(true);

    const sourceRepository = moduleRef.get(SourceRepository);
    const source = sourceRepository.findOrCreate({
      providerType: 'filesystem',
      providerInstanceId: 'local-1',
      canonicalUri: '/repo',
      displayName: 'repo',
      refreshIntervalSeconds: 3600,
    });

    expect(sourceRepository.findById(source.id)).toEqual(source);
  });
});
