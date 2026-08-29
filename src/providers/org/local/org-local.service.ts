import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import * as yaml from "js-yaml";
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
import type { OrgMember, OrgSnapshot } from "../org.types.js";
import {
  ORG_LOCAL_CONFIG_TOKEN,
  type OrgLocalConfigType,
} from "./org-local.config.js";

const SCHEMA_VERSION = "1.0.0";

interface RawOrgMember {
  name: string;
  role: string;
  team: string;
  email?: string;
  slackId?: string;
}

@Injectable()
export class OrgLocalService
  implements SnapshotProviderPort<OrgSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "org";
  readonly backendId = "local";
  readonly capabilityId = "org-local";

  private readonly filePath: string;

  constructor(
    @Inject(ORG_LOCAL_CONFIG_TOKEN)
    private readonly config: OrgLocalConfigType,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    this.filePath = resolve(this.config.path);
  }

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Local org data from ${this.config.path}`,
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
      const info = await stat(this.filePath);
      if (!info.isFile()) {
        return {
          status: "unavailable",
          message: `Path is not a file: ${this.filePath}`,
        };
      }
      return { status: "available", message: `Serving from ${this.filePath}` };
    } catch {
      return {
        status: "unavailable",
        message: `Path not accessible: ${this.filePath}`,
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<OrgSnapshot>> {
    const members = await this.loadMembers();

    let filtered = members;

    if (scope.filter) {
      const filterLower = scope.filter.toLowerCase();
      filtered = members.filter(
        (m) =>
          m.name.toLowerCase().includes(filterLower) ||
          m.team.toLowerCase().includes(filterLower) ||
          m.role.toLowerCase().includes(filterLower),
      );
    }

    if (scope.maxItems && filtered.length > scope.maxItems) {
      filtered = filtered.slice(0, scope.maxItems);
    }

    const teams = new Set(filtered.map((m) => m.team));

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: {
        members: filtered,
        teamCount: teams.size,
      },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "org" || parsed.backend !== "local") {
      return { resolved: false };
    }

    const members = await this.loadMembers();
    const idLower = parsed.id.toLowerCase();

    const member = members.find(
      (m) =>
        m.name.toLowerCase() === idLower ||
        (m.email && m.email.toLowerCase() === idLower),
    );

    if (!member) {
      return { resolved: false };
    }

    return {
      resolved: true,
      uri: member.ref,
      label: `${member.name} (${member.role}, ${member.team})`,
    };
  }

  private async loadMembers(): Promise<OrgMember[]> {
    const content = await readFile(this.filePath, "utf-8");
    const ext = extname(this.filePath).toLowerCase();

    let raw: unknown;
    if (ext === ".json") {
      raw = JSON.parse(content);
    } else if (ext === ".yaml" || ext === ".yml") {
      raw = yaml.load(content);
    } else {
      raw = JSON.parse(content);
    }

    const rawMembers = Array.isArray(raw)
      ? (raw as RawOrgMember[])
      : ((raw as { members?: RawOrgMember[] }).members ?? []);

    return rawMembers.map((m) => ({
      ref: buildRef("org", "local", m.name),
      name: m.name,
      role: m.role,
      team: m.team,
      email: m.email,
      slackId: m.slackId,
    }));
  }
}
