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
import { GithubOrgHttpClientService } from "./github-org-http-client.service.js";
import {
  GITHUB_ORG_CONFIG_TOKEN,
  type GithubOrgConfigType,
} from "./github-org.config.js";
import type { OrgMember, OrgSnapshot } from "../org.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_RESULTS = 30;

interface GithubOrgMemberApi {
  readonly login: string;
  readonly id: number;
  readonly avatar_url: string;
  readonly html_url: string;
  readonly type: string;
  readonly site_admin: boolean;
}

@Injectable()
export class GithubOrgService
  implements SnapshotProviderPort<OrgSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "org";
  readonly backendId = "github";
  readonly capabilityId = "org-github";

  constructor(
    @Inject(GITHUB_ORG_CONFIG_TOKEN)
    private readonly config: GithubOrgConfigType,
    @Inject(GithubOrgHttpClientService)
    private readonly http: GithubOrgHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `GitHub Org members for ${this.config.orgName}`,
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
        message: "Connected to GitHub as authenticated user",
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
  ): Promise<ProviderSnapshot<OrgSnapshot>> {
    const maxItems = scope.maxItems ?? DEFAULT_MAX_RESULTS;
    const members = await this.fetchMembers(maxItems, scope.filter);

    const teams = new Set(members.map((m) => m.team));

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: {
        members,
        teamCount: teams.size,
      },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "org" || parsed.backend !== "github") {
      return { resolved: false };
    }

    return {
      resolved: true,
      uri: `https://github.com/${parsed.id}`,
      label: `@${parsed.id}`,
    };
  }

  private async fetchMembers(
    maxItems: number,
    filter?: string,
  ): Promise<OrgMember[]> {
    const rawMembers = await this.http.getAll<GithubOrgMemberApi>(
      `/orgs/${this.config.orgName}/members`,
      maxItems,
    );

    let members: OrgMember[] = rawMembers.map((m) => ({
      ref: buildRef("org", "github", m.login),
      name: m.login,
      role: "member",
      team: this.config.orgName,
    }));

    if (filter) {
      const filterLower = filter.toLowerCase();
      members = members.filter(
        (m) =>
          m.name.toLowerCase().includes(filterLower) ||
          m.team.toLowerCase().includes(filterLower) ||
          m.role.toLowerCase().includes(filterLower),
      );
    }

    if (members.length > maxItems) {
      members = members.slice(0, maxItems);
    }

    return members;
  }
}
