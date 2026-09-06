import { Injectable } from '@nestjs/common';
import { createTimestamp } from '../shared/primitives.js';
import { WorkspaceSlugSchema } from '../shared/schemas.js';
import type { GlobalConfig } from './global-config.schema.js';
import { GLOBAL_CONFIG_SCHEMA_VERSION } from './global-config.schema.js';
import type { ProviderConfig } from './provider-config.schema.js';
import type { RepoConfig } from './repo-config.schema.js';
import { WorkspaceFsService } from './workspace-fs.service.js';
import type { WorkspaceMetadata } from './workspace-metadata.schema.js';
import { WORKSPACE_CONFIG_SCHEMA_VERSION } from './workspace-metadata.schema.js';
import {
  DuplicateWorkspaceError,
  NoActiveWorkspaceError,
  WorkspaceConfigValidationError,
  WorkspaceNotFoundError,
} from './workspace.errors.js';
import { formatZodIssues } from './zod-error.util.js';

export interface WorkspaceListEntry {
  readonly metadata: WorkspaceMetadata;
  readonly active: boolean;
}

export interface WorkspaceDetails {
  readonly metadata: WorkspaceMetadata;
  readonly providers: readonly ProviderConfig[];
  readonly repos: readonly RepoConfig[];
  readonly path: string;
  readonly active: boolean;
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly fs: WorkspaceFsService) {}

  private validateSlug(rawSlug: string): string {
    const result = WorkspaceSlugSchema.safeParse(rawSlug);
    if (!result.success) {
      throw new WorkspaceConfigValidationError(
        `workspace slug "${rawSlug}"`,
        formatZodIssues(result.error),
      );
    }
    return result.data;
  }

  async create(
    rawSlug: string,
    displayName?: string,
  ): Promise<WorkspaceMetadata> {
    const slug = this.validateSlug(rawSlug);

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

  async list(): Promise<readonly WorkspaceListEntry[]> {
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

  async select(rawSlug: string): Promise<GlobalConfig> {
    const slug = this.validateSlug(rawSlug);
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

  async resolveActiveOrGivenSlug(rawSlug?: string): Promise<string> {
    if (rawSlug !== undefined) {
      return this.validateSlug(rawSlug);
    }

    const globalConfig = await this.fs.readGlobalConfig();
    if (!globalConfig.activeWorkspace) {
      throw new NoActiveWorkspaceError();
    }
    return globalConfig.activeWorkspace;
  }

  async show(rawSlug: string): Promise<WorkspaceDetails> {
    const slug = this.validateSlug(rawSlug);
    if (!(await this.fs.workspaceExists(slug))) {
      throw new WorkspaceNotFoundError(slug);
    }

    const [metadata, providers, repos, globalConfig, path] = await Promise.all([
      this.fs.readWorkspaceMetadata(slug),
      this.fs.readProviders(slug),
      this.fs.readRepos(slug),
      this.fs.readGlobalConfig(),
      this.fs.resolveWorkspacePath(slug),
    ]);

    return {
      metadata,
      providers,
      repos,
      path,
      active: metadata.slug === globalConfig.activeWorkspace,
    };
  }

  async delete(rawSlug: string): Promise<void> {
    const slug = this.validateSlug(rawSlug);
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
}
