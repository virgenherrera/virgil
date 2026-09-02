import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { createTimestamp } from '../shared/primitives.js';
import type { WorkspaceId } from '../shared/workspace.types.js';
import type { GlobalConfig } from './global-config.schema.js';
import { GLOBAL_CONFIG_SCHEMA_VERSION } from './global-config.schema.js';
import type {
  NewProviderConfigInput,
  ProviderConfig,
} from './provider-config.schema.js';
import { NewProviderConfigInputSchema } from './provider-config.schema.js';
import type { NewRepoConfigInput, RepoConfig } from './repo-config.schema.js';
import { NewRepoConfigInputSchema } from './repo-config.schema.js';
import { WorkspaceFsService } from './workspace-fs.service.js';
import type { WorkspaceMetadata } from './workspace-metadata.schema.js';
import {
  WORKSPACE_CONFIG_SCHEMA_VERSION,
  WorkspaceSlugSchema,
} from './workspace-metadata.schema.js';
import {
  DuplicateRepoError,
  DuplicateWorkspaceError,
  NoActiveWorkspaceError,
  WorkspaceConfigValidationError,
  WorkspaceNotFoundError,
} from './workspace.errors.js';
import { formatZodIssues } from './zod-error.util.js';

/** One row of `listWorkspaces()`: a workspace's metadata plus whether it is active. */
export interface WorkspaceListEntry {
  readonly metadata: WorkspaceMetadata;
  readonly active: boolean;
}

/** Full detail returned by `showWorkspace()`. */
export interface WorkspaceDetails {
  readonly metadata: WorkspaceMetadata;
  readonly providers: readonly ProviderConfig[];
  readonly repos: readonly RepoConfig[];
}

/**
 * Workspace lifecycle and registration orchestration. Owns the business
 * rules (slug validation, duplicate detection, active-workspace
 * resolution); delegates every actual read/write to `WorkspaceFsService`.
 * This is the service the CLI commands (D7) and downstream handoffs
 * inject to work with workspaces.
 */
@Injectable()
export class WorkspaceService {
  constructor(private readonly fs: WorkspaceFsService) {}

  private parseSlug(rawSlug: string): WorkspaceId {
    const result = WorkspaceSlugSchema.safeParse(rawSlug);
    if (!result.success) {
      throw new WorkspaceConfigValidationError(
        `workspace slug "${rawSlug}"`,
        formatZodIssues(result.error),
      );
    }
    return result.data;
  }

  private parseOrThrow<Schema extends z.ZodType>(
    schema: Schema,
    data: unknown,
    context: string,
  ): z.infer<Schema> {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new WorkspaceConfigValidationError(
        context,
        formatZodIssues(result.error),
      );
    }
    return result.data;
  }

  async createWorkspace(
    rawSlug: string,
    displayName?: string,
  ): Promise<WorkspaceMetadata> {
    const slug = this.parseSlug(rawSlug);

    if (await this.fs.workspaceExists(slug)) {
      throw new DuplicateWorkspaceError(slug);
    }

    const now = createTimestamp();
    const metadata: WorkspaceMetadata = {
      schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
      slug,
      displayName,
      createdAt: now,
      updatedAt: now,
    };

    await this.fs.writeWorkspaceMetadata(slug, metadata);
    await this.fs.writeProviders(slug, []);
    await this.fs.writeRepos(slug, []);

    return metadata;
  }

  async listWorkspaces(): Promise<readonly WorkspaceListEntry[]> {
    const [slugs, globalConfig] = await Promise.all([
      this.fs.listWorkspaceSlugs(),
      this.fs.readGlobalConfig(),
    ]);

    return Promise.all(
      slugs.map(async (slug) => {
        const metadata = await this.fs.readWorkspaceMetadata(slug);
        return {
          metadata,
          active: metadata.slug === globalConfig.activeWorkspace,
        };
      }),
    );
  }

  async selectWorkspace(rawSlug: string): Promise<GlobalConfig> {
    const slug = this.parseSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    const config: GlobalConfig = {
      schemaVersion: GLOBAL_CONFIG_SCHEMA_VERSION,
      activeWorkspace: slug,
    };
    await this.fs.writeGlobalConfig(config);
    return config;
  }

  /** Resolves `rawSlug` if given, otherwise the active workspace slug. */
  async resolveActiveOrGivenSlug(rawSlug?: string): Promise<WorkspaceId> {
    if (rawSlug !== undefined) {
      return this.parseSlug(rawSlug);
    }

    const globalConfig = await this.fs.readGlobalConfig();
    if (!globalConfig.activeWorkspace) {
      throw new NoActiveWorkspaceError();
    }
    return globalConfig.activeWorkspace;
  }

  async showWorkspace(rawSlug?: string): Promise<WorkspaceDetails> {
    const slug = await this.resolveActiveOrGivenSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    const [metadata, providers, repos] = await Promise.all([
      this.fs.readWorkspaceMetadata(slug),
      this.fs.readProviders(slug),
      this.fs.readRepos(slug),
    ]);

    return { metadata, providers, repos };
  }

  async deleteWorkspace(rawSlug: string): Promise<void> {
    const slug = this.parseSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    await this.fs.deleteWorkspaceDir(slug);

    const globalConfig = await this.fs.readGlobalConfig();
    if (globalConfig.activeWorkspace === slug) {
      await this.fs.writeGlobalConfig({
        schemaVersion: GLOBAL_CONFIG_SCHEMA_VERSION,
      });
    }
  }

  async registerProvider(
    rawSlug: string,
    input: NewProviderConfigInput,
  ): Promise<ProviderConfig> {
    const slug = this.parseSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    const validatedInput = this.parseOrThrow(
      NewProviderConfigInputSchema,
      input,
      `provider registration for workspace "${slug}"`,
    );

    const now = createTimestamp();
    const provider = {
      ...validatedInput,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as ProviderConfig;

    const providers = await this.fs.readProviders(slug);
    await this.fs.writeProviders(slug, [...providers, provider]);
    return provider;
  }

  async registerRepo(
    rawSlug: string,
    input: NewRepoConfigInput,
  ): Promise<RepoConfig> {
    const slug = this.parseSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    const validatedInput = this.parseOrThrow(
      NewRepoConfigInputSchema,
      input,
      `repository registration for workspace "${slug}"`,
    );

    const repos = await this.fs.readRepos(slug);
    if (repos.some((repo) => repo.path === validatedInput.path)) {
      throw new DuplicateRepoError(validatedInput.path, slug);
    }

    const now = createTimestamp();
    const repo: RepoConfig = {
      ...validatedInput,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await this.fs.writeRepos(slug, [...repos, repo]);
    return repo;
  }
}
