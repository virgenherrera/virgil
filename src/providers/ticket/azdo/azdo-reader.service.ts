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
import { AzdoHttpClientService } from "./azdo-http-client.service.js";
import { AZDO_CONFIG_TOKEN, type AzdoConfigType } from "./azdo.config.js";
import type {
  AzdoWorkItemBrief,
  AzdoWorkItemSnapshot,
} from "./azdo.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_RESULTS = 200;

interface WiqlResponse {
  readonly workItems: ReadonlyArray<{ readonly id: number }>;
}

interface AzdoWorkItemFieldsResponse {
  readonly value: ReadonlyArray<{
    readonly id: number;
    readonly fields: Record<string, unknown>;
  }>;
}

@Injectable()
export class AzdoReaderService
  implements SnapshotProviderPort<AzdoWorkItemSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "ticket";
  readonly backendId = "azdo";
  readonly capabilityId = "ticket-azdo";

  constructor(
    @Inject(AZDO_CONFIG_TOKEN)
    private readonly config: AzdoConfigType,
    @Inject(AzdoHttpClientService)
    private readonly http: AzdoHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Azure DevOps work items for ${this.config.project}`,
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
      await this.http.checkHealth<{ id: string; name: string }>();
      return {
        status: "available",
        message: `Connected to Azure DevOps project ${this.config.project}`,
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Azure DevOps",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<AzdoWorkItemSnapshot>> {
    const maxItems = scope.maxItems ?? DEFAULT_MAX_RESULTS;
    const workItems = await this.fetchWorkItems(maxItems);

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: {
        orgUrl: this.config.orgUrl,
        project: this.config.project,
        workItems,
      },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "ticket" || parsed.backend !== "azdo") {
      return { resolved: false };
    }

    const orgUrl = this.config.orgUrl.replace(/\/$/, "");
    return {
      resolved: true,
      uri: `${orgUrl}/${this.config.project}/_workitems/edit/${parsed.id}`,
    };
  }

  private async fetchWorkItems(
    maxItems: number,
  ): Promise<AzdoWorkItemBrief[]> {
    const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.config.project}' AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC`;

    const wiqlResult = await this.http.post<WiqlResponse>("wit/wiql", {
      query: wiqlQuery,
    });

    const ids = wiqlResult.workItems.map((wi) => wi.id).slice(0, maxItems);

    if (ids.length === 0) {
      return [];
    }

    const fields = [
      "System.Id",
      "System.Title",
      "System.State",
      "System.AssignedTo",
      "System.WorkItemType",
      "System.AreaPath",
      "System.IterationPath",
      "System.CreatedDate",
      "System.ChangedDate",
    ].join(",");

    const response = await this.http.get<AzdoWorkItemFieldsResponse>(
      `wit/workitems?ids=${ids.join(",")}&fields=${fields}`,
    );

    return response.value.map((item) => {
      const f = item.fields;
      const assignedTo = f["System.AssignedTo"] as
        | { displayName: string }
        | null
        | undefined;

      return {
        ref: buildRef("ticket", "azdo", String(item.id)),
        id: item.id,
        title: (f["System.Title"] as string) ?? "",
        state: (f["System.State"] as string) ?? "",
        assignedTo: assignedTo?.displayName ?? null,
        workItemType: (f["System.WorkItemType"] as string) ?? "",
        areaPath: (f["System.AreaPath"] as string) ?? "",
        iterationPath: (f["System.IterationPath"] as string) ?? "",
        createdDate: (f["System.CreatedDate"] as string) ?? "",
        changedDate: (f["System.ChangedDate"] as string) ?? "",
      };
    });
  }
}
