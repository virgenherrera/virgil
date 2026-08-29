import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
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
import { GithubHttpClientService } from "./github-http-client.service.js";
import {
  GITHUB_CONFIG_TOKEN,
  type GithubIssuesConfigType,
} from "./github-issues.config.js";
import type {
  GithubIssueBrief,
  GithubIssueSnapshot,
} from "./github-issues.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_RESULTS = 30;

interface GithubApiIssue {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly body: string | null;
  readonly html_url: string;
  readonly assignee: { readonly login: string } | null;
  readonly labels: ReadonlyArray<{
    readonly name: string;
    readonly color: string;
  }>;
  readonly milestone: {
    readonly number: number;
    readonly title: string;
    readonly state: string;
  } | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly comments: number;
}

@Injectable()
export class GithubIssuesReaderService
  implements SnapshotProviderPort<GithubIssueSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "ticket";
  readonly backendId = "github";
  readonly capabilityId = "ticket-github";

  constructor(
    @Inject(GITHUB_CONFIG_TOKEN)
    private readonly config: GithubIssuesConfigType,
    @Inject(GithubHttpClientService)
    private readonly http: GithubHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `GitHub Issues for ${this.config.owner}/${this.config.repo}`,
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
    try {
      await this.http.get<{ login: string }>("/user");
      return {
        status: "available",
        message: `Connected to GitHub as authenticated user`,
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to GitHub",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<GithubIssueSnapshot>> {
    const maxItems = scope.maxItems ?? DEFAULT_MAX_RESULTS;
    const issues = await this.fetchIssues(maxItems);

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: {
        owner: this.config.owner,
        repo: this.config.repo,
        issues,
      },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "ticket" || parsed.backend !== "github") {
      return { resolved: false };
    }

    try {
      const issue = await this.http.get<GithubApiIssue>(
        `/repos/${this.config.owner}/${this.config.repo}/issues/${parsed.id}`,
      );
      return {
        resolved: true,
        uri: issue.html_url,
        label: `#${issue.number}: ${issue.title}`,
      };
    } catch {
      return { resolved: false };
    }
  }

  private async fetchIssues(
    maxItems: number,
  ): Promise<GithubIssueBrief[]> {
    const rawIssues = await this.http.getAll<GithubApiIssue>(
      `/repos/${this.config.owner}/${this.config.repo}/issues?state=open`,
      maxItems,
    );

    return rawIssues.map((issue) => ({
      ref: buildRef("ticket", "github", String(issue.number)),
      number: issue.number,
      title: issue.title,
      state: issue.state,
      assignee: issue.assignee?.login ?? null,
      labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
      milestone: issue.milestone
        ? {
            number: issue.milestone.number,
            title: issue.milestone.title,
            state: issue.milestone.state,
          }
        : null,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));
  }
}
