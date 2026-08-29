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
import { JiraHttpClientService } from "./jira-http-client.service.js";
import { JIRA_CONFIG_TOKEN, type JiraConfigType } from "./jira.config.js";
import type {
  JiraBoard,
  JiraIssueBrief,
  JiraIssueDetail,
  JiraSnapshot,
  JiraSprint,
} from "./jira.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_RESULTS = 50;

@Injectable()
export class JiraReaderService
  implements SnapshotProviderPort<JiraSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "ticket";
  readonly backendId = "jira";
  readonly capabilityId = "ticket-jira";

  constructor(
    @Inject(JIRA_CONFIG_TOKEN)
    private readonly config: JiraConfigType,
    @Inject(JiraHttpClientService)
    private readonly http: JiraHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Jira board ${this.config.boardId} at ${this.config.siteUrl}`,
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
      await this.http.get<{ emailAddress: string }>(
        "/rest/api/2/myself",
      );
      return {
        status: "available",
        message: `Connected to ${this.config.siteUrl}`,
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Jira",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<JiraSnapshot>> {
    const board = await this.fetchBoard();
    const activeSprint = await this.fetchActiveSprint();
    const issues = await this.fetchIssues(activeSprint, scope);

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: { board, activeSprint, issues },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "ticket" || parsed.backend !== "jira") {
      return { resolved: false };
    }

    try {
      const issue = await this.fetchIssueDetail(parsed.id);
      return {
        resolved: true,
        uri: `${this.config.siteUrl}/browse/${issue.key}`,
        label: `${issue.key}: ${issue.summary}`,
      };
    } catch {
      return { resolved: false };
    }
  }

  private async fetchBoard(): Promise<JiraBoard> {
    const response = await this.http.get<{
      id: number;
      name: string;
      type: string;
    }>(`/rest/agile/1.0/board/${this.config.boardId}`);

    return {
      id: response.id,
      name: response.name,
      type: response.type,
    };
  }

  private async fetchActiveSprint(): Promise<JiraSprint | null> {
    try {
      const response = await this.http.get<{
        values: Array<{
          id: number;
          name: string;
          state: string;
          startDate?: string;
          endDate?: string;
        }>;
      }>(
        `/rest/agile/1.0/board/${this.config.boardId}/sprint?state=active`,
      );

      const active = response.values[0];
      if (!active) return null;

      return {
        id: active.id,
        name: active.name,
        state: active.state,
        startDate: active.startDate ?? null,
        endDate: active.endDate ?? null,
      };
    } catch {
      return null;
    }
  }

  private async fetchIssues(
    sprint: JiraSprint | null,
    scope: SnapshotScope,
  ): Promise<JiraIssueBrief[]> {
    const maxResults = scope.maxItems ?? DEFAULT_MAX_RESULTS;
    const fields =
      "key,summary,status,assignee,priority,labels,parent";

    let path: string;
    if (sprint) {
      path = `/rest/agile/1.0/sprint/${sprint.id}/issue?fields=${fields}`;
    } else {
      path = `/rest/agile/1.0/board/${this.config.boardId}/issue?fields=${fields}`;
    }

    const response = await this.http.getPage<{
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        assignee: { displayName: string } | null;
        priority: { name: string };
        labels: string[];
        parent?: { key: string };
      };
    }>(path, 0, maxResults);

    const rawIssues = response.issues ?? response.values ?? [];

    return rawIssues.map((issue) => ({
      ref: buildRef("ticket", "jira", issue.key),
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName ?? null,
      priority: issue.fields.priority.name,
      labels: issue.fields.labels,
      parentKey: issue.fields.parent?.key ?? null,
    }));
  }

  private async fetchIssueDetail(
    issueKey: string,
  ): Promise<JiraIssueDetail> {
    const response = await this.http.get<{
      key: string;
      fields: {
        summary: string;
        description: string | null;
        issuetype: { name: string };
        status: { name: string };
        assignee: { displayName: string } | null;
        priority: { name: string };
        labels: string[];
        parent?: { key: string };
        created: string;
        updated: string;
      };
    }>(`/rest/api/2/issue/${issueKey}?fields=summary,description,issuetype,status,assignee,priority,labels,parent,created,updated`);

    return {
      ref: buildRef("ticket", "jira", response.key),
      key: response.key,
      summary: response.fields.summary,
      description: response.fields.description,
      issueType: response.fields.issuetype.name,
      status: response.fields.status.name,
      assignee: response.fields.assignee?.displayName ?? null,
      priority: response.fields.priority.name,
      labels: response.fields.labels,
      parentKey: response.fields.parent?.key ?? null,
      created: response.fields.created,
      updated: response.fields.updated,
    };
  }
}
