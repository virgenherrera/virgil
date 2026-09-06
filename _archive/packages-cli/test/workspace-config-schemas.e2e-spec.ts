import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createTimestamp } from '../src/shared/primitives.js';
import {
  CredentialRefSchema,
  GithubIssuesProviderConfigSchema,
  LocalFsProviderConfigSchema,
  ProviderConfigSchema,
  ProviderFamily,
  RepoConfigSchema,
} from '../src/workspace/index.js';
import type {
  CredentialRef,
  ProviderConfig,
  RepoConfig,
} from '../src/workspace/index.js';

/**
 * Stand-in for a future adapter registrar: builds fully-typed provider,
 * repo, and credential-reference records through an injected factory,
 * mirroring how a real workspace-registration consumer would compose the
 * H03 schemas together rather than exercising `schema.parse()` on
 * hand-written literals with no DI involvement.
 */
@Injectable()
class WorkspaceConfigFactoryService {
  buildGithubIssuesProvider(id: string): ProviderConfig {
    const now = createTimestamp();
    return {
      id,
      type: 'github-issues',
      family: ProviderFamily.ISSUE,
      enabled: true,
      credentialRef: { source: 'env', variableName: 'GITHUB_TOKEN' },
      owner: 'virgil-project',
      repo: 'virgil',
      createdAt: now,
      updatedAt: now,
    };
  }

  buildLocalFsProvider(id: string): ProviderConfig {
    const now = createTimestamp();
    return {
      id,
      type: 'local-fs',
      family: ProviderFamily.KNOWLEDGE,
      enabled: false,
      path: '/repos/virgil',
      createdAt: now,
      updatedAt: now,
    };
  }

  buildRepoConfig(id: string, path: string): RepoConfig {
    const now = createTimestamp();
    return {
      id,
      path,
      alias: 'virgil-monorepo',
      remoteUrl: 'https://example.com/virgil-project/virgil.git',
      defaultBranch: 'main',
      createdAt: now,
      updatedAt: now,
    };
  }

  buildKeychainCredentialRef(): CredentialRef {
    return { source: 'keychain', service: 'virgil', account: 'github-token' };
  }
}

@Module({
  providers: [WorkspaceConfigFactoryService],
  exports: [WorkspaceConfigFactoryService],
})
class WorkspaceConfigFactoryModule {}

describe('workspace configuration schemas composed through a NestJS provider (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: WorkspaceConfigFactoryService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WorkspaceConfigFactoryModule],
    }).compile();
    factory = moduleRef.get(WorkspaceConfigFactoryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('validates a github-issues provider through the discriminated union', () => {
    const provider = factory.buildGithubIssuesProvider(
      '11111111-1111-4111-8111-111111111111',
    );

    const parsed = ProviderConfigSchema.parse(provider);

    expect(parsed.type).toBe('github-issues');
    expect(GithubIssuesProviderConfigSchema.safeParse(provider).success).toBe(
      true,
    );
  });

  it('validates a local-fs provider through the same discriminated union, proving extensibility across branches', () => {
    const provider = factory.buildLocalFsProvider(
      '22222222-2222-4222-8222-222222222222',
    );

    const parsed = ProviderConfigSchema.parse(provider);

    expect(parsed.type).toBe('local-fs');
    expect(LocalFsProviderConfigSchema.safeParse(provider).success).toBe(true);
  });

  it('rejects a provider whose type has no matching discriminated-union branch', () => {
    const provider = factory.buildGithubIssuesProvider(
      '33333333-3333-4333-8333-333333333333',
    );
    const malformed = { ...provider, type: 'unknown-provider-type' };

    expect(() => ProviderConfigSchema.parse(malformed)).toThrow();
  });

  it('validates a repository registration with an absolute path', () => {
    const repo = factory.buildRepoConfig(
      '44444444-4444-4444-8444-444444444444',
      '/repos/virgil',
    );

    expect(() => RepoConfigSchema.parse(repo)).not.toThrow();
  });

  it('rejects a repository registration with a relative path', () => {
    const repo = factory.buildRepoConfig(
      '55555555-5555-4555-8555-555555555555',
      'relative/path',
    );

    expect(() => RepoConfigSchema.parse(repo)).toThrow(/absolute/);
  });

  it('stores credential references as typed pointers, never as raw secret values', () => {
    const provider = factory.buildGithubIssuesProvider(
      '66666666-6666-4666-8666-666666666666',
    );
    const keychainRef = factory.buildKeychainCredentialRef();

    expect(CredentialRefSchema.parse(provider.credentialRef)).toEqual(
      provider.credentialRef,
    );
    expect(CredentialRefSchema.parse(keychainRef)).toEqual(keychainRef);

    const serialized = JSON.stringify({
      ...provider,
      credentialRef: keychainRef,
    });
    expect(serialized).not.toContain('"token"');
    expect(serialized).not.toContain('"secret"');
  });

  it('rejects a credential reference for an unrecognized source', () => {
    expect(() =>
      CredentialRefSchema.parse({
        source: 'plaintext',
        value: 'sk-should-not-exist',
      }),
    ).toThrow();
  });
});
