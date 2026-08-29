import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import { Observable } from "rxjs";
import type {
  ObservableProviderPort,
  ProviderEvent,
  ProviderHealth,
  ProviderSnapshot,
  RefResolution,
  SnapshotProviderPort,
  SnapshotScope,
} from "../../../ports/context-provider.port.js";
import { buildRef, parseRef } from "../../../domain/refs.js";
import type { ProviderKind } from "../../../domain/refs.js";
import { EVENT_KIND, type VirgilEvent } from "../../../reactive/event.types.js";
import { CapabilityRegistryService } from "../../../capabilities/capability-registry.service.js";
import { ProviderRegistryService } from "../../provider-registry.service.js";
import type {
  CommitBrief,
  RepoInfo,
  SourceCodeSnapshot,
} from "../sourcecode.types.js";
import {
  SOURCECODE_LOCAL_CONFIG_TOKEN,
  type SourceCodeLocalConfigType,
} from "./sourcecode-local.config.js";

const SCHEMA_VERSION = "1.0.0";

@Injectable()
export class SourceCodeLocalService
  implements
    SnapshotProviderPort<SourceCodeSnapshot>,
    ObservableProviderPort<VirgilEvent>,
    OnModuleInit
{
  readonly kind: ProviderKind = "sourcecode";
  readonly backendId = "local";
  readonly capabilityId = "sourcecode-local";

  private readonly repoPaths: readonly string[];

  constructor(
    @Inject(SOURCECODE_LOCAL_CONFIG_TOKEN)
    private readonly config: SourceCodeLocalConfigType,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    this.repoPaths = this.config.paths.map((p) => resolve(p));
  }

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Local source code from ${this.repoPaths.length} repo(s)`,
      status: "configured-unverified",
    });
    this.providerRegistry.register(this);

    const health = await this.healthCheck();
    if (health.status === "available") {
      this.capabilityRegistry.markAvailable(this.capabilityId);
    } else {
      this.capabilityRegistry.markDegraded(this.capabilityId);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const results = this.repoPaths.map((repoPath) => {
      try {
        execSync("git rev-parse --show-toplevel", {
          cwd: repoPath,
          stdio: "pipe",
        });
        return true;
      } catch {
        return false;
      }
    });

    const validCount = results.filter(Boolean).length;

    if (validCount === this.repoPaths.length) {
      return {
        status: "available",
        message: `All ${validCount} repo(s) accessible`,
      };
    }

    if (validCount > 0) {
      return {
        status: "degraded",
        message: `${validCount}/${this.repoPaths.length} repo(s) accessible`,
      };
    }

    return {
      status: "unavailable",
      message: "No configured repos are accessible",
    };
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<SourceCodeSnapshot>> {
    const repos: RepoInfo[] = [];

    for (const repoPath of this.repoPaths) {
      try {
        const info = this.readRepoInfo(repoPath);
        repos.push(info);
      } catch {
        // Skip inaccessible repos gracefully
      }
    }

    let filtered: RepoInfo[] = repos;

    if (scope.filter) {
      const filterLower = scope.filter.toLowerCase();
      filtered = repos.filter((r) =>
        r.name.toLowerCase().includes(filterLower),
      );
    }

    if (scope.maxItems && filtered.length > scope.maxItems) {
      filtered = filtered.slice(0, scope.maxItems);
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: filtered,
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "sourcecode" || parsed.backend !== "local") {
      return { resolved: false };
    }

    const idLower = parsed.id.toLowerCase();

    for (const repoPath of this.repoPaths) {
      const name = basename(repoPath);
      if (name.toLowerCase() === idLower) {
        return {
          resolved: true,
          uri: `file://${repoPath}`,
          label: name,
        };
      }
    }

    return { resolved: false };
  }

  poll(since: Date): Observable<ProviderEvent<VirgilEvent>> {
    return new Observable((subscriber) => {
      for (const repoPath of this.repoPaths) {
        try {
          const commits = this.getCommitsSince(repoPath, since);

          for (const commit of commits) {
            const ref = buildRef("sourcecode", "local", basename(repoPath));

            subscriber.next({
              kind: this.kind,
              backendId: this.backendId,
              timestamp: new Date(commit.date),
              payload: {
                kind: EVENT_KIND.COMMIT_PUSHED,
                ref,
                timestamp: commit.date,
                source: `sourcecode-local:${basename(repoPath)}`,
                payload: {
                  sha: commit.sha,
                  message: commit.message,
                  author: commit.author,
                },
              },
            });
          }
        } catch {
          // Skip inaccessible repos
        }
      }

      subscriber.complete();
    });
  }

  private getCommitsSince(repoPath: string, since: Date): CommitBrief[] {
    const sinceIso = since.toISOString();
    const raw = execSync(
      `git log --after="${sinceIso}" --format=%H|%s|%an|%aI`,
      { cwd: repoPath, stdio: "pipe" },
    )
      .toString()
      .trim();

    if (!raw) return [];

    return raw.split("\n").map((line) => {
      const [sha, message, author, date] = line.split("|");
      return {
        sha: sha!,
        message: message!,
        author: author!,
        date: date!,
      };
    });
  }

  private readRepoInfo(repoPath: string): RepoInfo {
    const name = basename(repoPath);
    const git = (cmd: string): string =>
      execSync(cmd, { cwd: repoPath, stdio: "pipe" })
        .toString()
        .trim();

    const branch = git("git rev-parse --abbrev-ref HEAD");
    const commitSha = git("git rev-parse HEAD");
    const commitMessage = git("git log -1 --format=%s");

    const statusOutput = git("git status --porcelain");
    const uncommittedChanges = statusOutput
      ? statusOutput.split("\n").length
      : 0;

    const recentCommitsRaw = git("git log -10 --format=%H|%s|%an|%aI");
    const recentCommits: CommitBrief[] = recentCommitsRaw
      ? recentCommitsRaw.split("\n").map((line) => {
          const [sha, message, author, date] = line.split("|");
          return {
            sha: sha!,
            message: message!,
            author: author!,
            date: date!,
          };
        })
      : [];

    return {
      ref: buildRef("sourcecode", "local", name),
      path: repoPath,
      name,
      branch,
      commitSha,
      commitMessage,
      uncommittedChanges,
      recentCommits,
    };
  }
}
