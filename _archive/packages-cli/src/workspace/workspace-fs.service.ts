import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { GlobalConfig } from './global-config.schema.js';
import {
  GlobalConfigSchema,
  createEmptyGlobalConfig,
} from './global-config.schema.js';
import type { ProviderConfig } from './provider-config.schema.js';
import { ProviderConfigSchema } from './provider-config.schema.js';
import type { RepoConfig } from './repo-config.schema.js';
import { RepoConfigSchema } from './repo-config.schema.js';
import { StateDirectoryService } from './state-directory.service.js';
import type { WorkspaceMetadata } from './workspace-metadata.schema.js';
import { WorkspaceMetadataSchema } from './workspace-metadata.schema.js';
import { WorkspaceConfigValidationError } from './workspace.errors.js';
import { formatZodIssues } from './zod-error.util.js';

const WORKSPACES_DIR_NAME = 'workspaces';
const WORKSPACE_CONFIG_FILE = 'workspace.config.json';
const GLOBAL_CONFIG_FILE = 'global.config.json';
const PROVIDERS_FILE = 'providers.json';
const REPOS_FILE = 'repos.json';

const ProviderConfigListSchema = z.array(ProviderConfigSchema);
const RepoConfigListSchema = z.array(RepoConfigSchema);

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonWithSchema<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const raw = await readFile(path, 'utf-8');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new WorkspaceConfigValidationError(path, [
      `File is not valid JSON: ${(error as Error).message}`,
    ]);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new WorkspaceConfigValidationError(
      path,
      formatZodIssues(result.error),
    );
  }

  return result.data;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/**
 * Low-level filesystem boundary for workspace and global configuration.
 * Every read validates through Zod (never raw JSON manipulation without
 * validation); every write serializes an already-validated object.
 * Business rules (duplicate detection, active-workspace resolution) live
 * in `WorkspaceService` — this service only knows about paths, JSON, and
 * schemas.
 */
@Injectable()
export class WorkspaceFsService {
  constructor(private readonly stateDirectory: StateDirectoryService) {}

  private async stateRoot(): Promise<string> {
    return this.stateDirectory.ensureRoot();
  }

  private workspacesRoot(root: string): string {
    return join(root, WORKSPACES_DIR_NAME);
  }

  private workspaceDir(root: string, slug: string): string {
    return join(this.workspacesRoot(root), slug);
  }

  async readGlobalConfig(): Promise<GlobalConfig> {
    const root = await this.stateRoot();
    const path = join(root, GLOBAL_CONFIG_FILE);
    if (!(await pathExists(path))) {
      return createEmptyGlobalConfig();
    }
    return readJsonWithSchema(path, GlobalConfigSchema);
  }

  async writeGlobalConfig(config: GlobalConfig): Promise<void> {
    const root = await this.stateRoot();
    await writeJson(join(root, GLOBAL_CONFIG_FILE), config);
  }

  async workspaceExists(slug: string): Promise<boolean> {
    const root = await this.stateRoot();
    return pathExists(
      join(this.workspaceDir(root, slug), WORKSPACE_CONFIG_FILE),
    );
  }

  async listWorkspaceSlugs(): Promise<string[]> {
    const root = await this.stateRoot();
    const workspacesRoot = this.workspacesRoot(root);
    if (!(await pathExists(workspacesRoot))) {
      return [];
    }

    const entries = await readdir(workspacesRoot, { withFileTypes: true });
    const slugs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const hasConfig = await pathExists(
        join(workspacesRoot, entry.name, WORKSPACE_CONFIG_FILE),
      );
      if (hasConfig) {
        slugs.push(entry.name);
      }
    }

    return slugs.sort();
  }

  async readWorkspaceMetadata(slug: string): Promise<WorkspaceMetadata> {
    const root = await this.stateRoot();
    const path = join(this.workspaceDir(root, slug), WORKSPACE_CONFIG_FILE);
    return readJsonWithSchema(path, WorkspaceMetadataSchema);
  }

  async writeWorkspaceMetadata(
    slug: string,
    metadata: WorkspaceMetadata,
  ): Promise<void> {
    const root = await this.stateRoot();
    const dir = this.workspaceDir(root, slug);
    await mkdir(dir, { recursive: true });
    await writeJson(join(dir, WORKSPACE_CONFIG_FILE), metadata);
  }

  async deleteWorkspaceDir(slug: string): Promise<void> {
    const root = await this.stateRoot();
    await rm(this.workspaceDir(root, slug), { recursive: true, force: true });
  }

  async readProviders(slug: string): Promise<ProviderConfig[]> {
    const root = await this.stateRoot();
    const path = join(this.workspaceDir(root, slug), PROVIDERS_FILE);
    if (!(await pathExists(path))) {
      return [];
    }
    return readJsonWithSchema(path, ProviderConfigListSchema);
  }

  async writeProviders(
    slug: string,
    providers: readonly ProviderConfig[],
  ): Promise<void> {
    const root = await this.stateRoot();
    await writeJson(
      join(this.workspaceDir(root, slug), PROVIDERS_FILE),
      providers,
    );
  }

  async readRepos(slug: string): Promise<RepoConfig[]> {
    const root = await this.stateRoot();
    const path = join(this.workspaceDir(root, slug), REPOS_FILE);
    if (!(await pathExists(path))) {
      return [];
    }
    return readJsonWithSchema(path, RepoConfigListSchema);
  }

  async writeRepos(slug: string, repos: readonly RepoConfig[]): Promise<void> {
    const root = await this.stateRoot();
    await writeJson(join(this.workspaceDir(root, slug), REPOS_FILE), repos);
  }
}
