import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import fg from "fast-glob";
import type {
  ProviderHealth,
  ProviderSnapshot,
  RefResolution,
  SnapshotProviderPort,
  SnapshotScope,
} from "../../../ports/context-provider.port.js";
import { buildRef, parseRef } from "../../../domain/refs.js";
import type { ProviderKind } from "../../../domain/refs.js";
import { CapabilityRegistryService } from "../../../capabilities/capability-registry.service.js";
import { ProviderRegistryService } from "../../provider-registry.service.js";
import type { DogmaDocument } from "../dogma.types.js";
import {
  GITHUB_WIKI_CONFIG_TOKEN,
  type GithubWikiConfigType,
} from "./github-wiki.config.js";

const WIKI_SPECIAL_FILES = new Set([
  "_Sidebar.md",
  "_Footer.md",
  "_Header.md",
  "_Sidebar.markdown",
  "_Footer.markdown",
  "_Header.markdown",
]);
const SUPPORTED_EXTENSIONS = ["md", "markdown"];
const SCHEMA_VERSION = "1.0.0";

@Injectable()
export class GithubWikiService
  implements SnapshotProviderPort<DogmaDocument[]>, OnModuleInit
{
  readonly kind: ProviderKind = "dogma";
  readonly backendId = "github-wiki";
  readonly capabilityId = "dogma-github-wiki";

  constructor(
    @Inject(GITHUB_WIKI_CONFIG_TOKEN)
    private readonly config: GithubWikiConfigType,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `GitHub Wiki dogma from ${this.config.owner}/${this.config.repo}`,
      status: "configured-unverified",
    });
    this.providerRegistry.register(this);

    try {
      await this.ensureClone();
    } catch {
      // Clone failure is not fatal; health check will report status
    }

    const health = await this.healthCheck();
    if (health.status === "available") {
      this.capabilityRegistry.markAvailable(this.capabilityId);
    } else {
      this.capabilityRegistry.markDegraded(this.capabilityId);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const cacheDir = this.getCacheDir();

    if (!existsSync(join(cacheDir, ".git"))) {
      return {
        status: "unavailable",
        message: `Wiki cache not found at ${cacheDir}`,
      };
    }

    try {
      execSync("git fetch --depth 1 origin", {
        cwd: cacheDir,
        stdio: "pipe",
      });
      return {
        status: "available",
        message: `Wiki cache available at ${cacheDir}`,
      };
    } catch {
      // Cache exists but remote unreachable; still usable from cached data
      return {
        status: "available",
        message: `Wiki cache available (offline) at ${cacheDir}`,
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<DogmaDocument[]>> {
    const cacheDir = this.getCacheDir();
    const pattern = SUPPORTED_EXTENSIONS.map((ext) => `**/*.${ext}`);

    let entries = await fg(pattern, {
      cwd: cacheDir,
      absolute: false,
      onlyFiles: true,
      dot: false,
    });

    // Filter out wiki special files (layout chrome, not content)
    entries = entries.filter((e) => !WIKI_SPECIAL_FILES.has(e));

    if (scope.filter) {
      const filterLower = scope.filter.toLowerCase();
      entries = entries.filter((e) =>
        e.toLowerCase().includes(filterLower),
      );
    }

    if (scope.maxItems && entries.length > scope.maxItems) {
      entries = entries.slice(0, scope.maxItems);
    }

    const documents: DogmaDocument[] = await Promise.all(
      entries.map(async (relativePath) => {
        const absolutePath = resolve(cacheDir, relativePath);
        const [content, info] = await Promise.all([
          readFile(absolutePath, "utf-8"),
          stat(absolutePath),
        ]);
        return {
          ref: buildRef("dogma", "github-wiki", relativePath),
          relativePath,
          content,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        };
      }),
    );

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: documents,
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "dogma" || parsed.backend !== "github-wiki") {
      return { resolved: false };
    }

    const pageName = parsed.id.replace(/\.(md|markdown)$/, "");
    const wikiUrl = `https://github.com/${this.config.owner}/${this.config.repo}/wiki/${pageName}`;

    return {
      resolved: true,
      uri: wikiUrl,
      label: pageName,
    };
  }

  private getCacheDir(): string {
    if (this.config.cacheDir) {
      return this.config.cacheDir;
    }
    return join(
      process.cwd(),
      ".virgil",
      "cache",
      `wiki-${this.config.owner}-${this.config.repo}`,
    );
  }

  private async ensureClone(): Promise<string> {
    const cacheDir = this.getCacheDir();
    const gitDir = join(cacheDir, ".git");

    if (existsSync(gitDir)) {
      // Already cloned; fetch latest
      try {
        execSync("git fetch --depth 1 origin", {
          cwd: cacheDir,
          stdio: "pipe",
        });
        execSync("git reset --hard origin/master", {
          cwd: cacheDir,
          stdio: "pipe",
        });
      } catch {
        // Fetch failure is non-fatal; use cached data
      }
    } else {
      // Fresh clone
      const wikiUrl = this.buildWikiUrl();
      execSync(`git clone --depth 1 ${wikiUrl} ${cacheDir}`, {
        stdio: "pipe",
      });
    }

    return cacheDir;
  }

  private buildWikiUrl(): string {
    const { owner, repo, token } = this.config;
    if (token) {
      return `https://${token}@github.com/${owner}/${repo}.wiki.git`;
    }
    return `https://github.com/${owner}/${repo}.wiki.git`;
  }
}
