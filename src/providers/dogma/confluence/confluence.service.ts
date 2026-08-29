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
import { ConfluenceHttpClientService } from "./confluence-http-client.service.js";
import {
  CONFLUENCE_CONFIG_TOKEN,
  type ConfluenceConfigType,
} from "./confluence.config.js";
import type { DogmaDocument } from "../dogma.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_RESULTS = 25;

interface ConfluenceApiPage {
  readonly id: string;
  readonly title: string;
  readonly body: {
    readonly storage: {
      readonly value: string;
    };
  };
  readonly version?: {
    readonly when?: string;
  };
}

interface ConfluenceApiContentResponse {
  readonly results: readonly ConfluenceApiPage[];
}

/**
 * Strip HTML tags, decode common entities, and normalize whitespace.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

@Injectable()
export class ConfluenceService
  implements SnapshotProviderPort<DogmaDocument[]>, OnModuleInit
{
  readonly kind: ProviderKind = "dogma";
  readonly backendId = "confluence";
  readonly capabilityId = "dogma-confluence";

  constructor(
    @Inject(CONFLUENCE_CONFIG_TOKEN)
    private readonly config: ConfluenceConfigType,
    @Inject(ConfluenceHttpClientService)
    private readonly http: ConfluenceHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Confluence dogma from ${this.config.siteUrl}`,
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
      await this.http.get<{ accountId: string }>("/rest/api/user/current");
      return {
        status: "available",
        message: "Connected to Confluence as authenticated user",
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Confluence",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<DogmaDocument[]>> {
    const maxItems = scope.maxItems ?? DEFAULT_MAX_RESULTS;

    let path = `/rest/api/content?type=page&expand=body.storage,version&limit=${maxItems}`;
    if (this.config.spaceKey) {
      path += `&spaceKey=${this.config.spaceKey}`;
    }

    const response = await this.http.get<ConfluenceApiContentResponse>(path);

    let pages = [...response.results];

    if (scope.filter) {
      const filterLower = scope.filter.toLowerCase();
      pages = pages.filter((page) =>
        page.title.toLowerCase().includes(filterLower),
      );
    }

    const documents: DogmaDocument[] = pages.map((page) => ({
      ref: buildRef("dogma", "confluence", page.id),
      relativePath: page.title,
      content: htmlToText(page.body.storage.value),
      size: page.body.storage.value.length,
      modifiedAt: page.version?.when ?? new Date().toISOString(),
    }));

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: documents,
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "dogma" || parsed.backend !== "confluence") {
      return { resolved: false };
    }

    const siteUrl = this.config.siteUrl.replace(/\/$/, "");

    return {
      resolved: true,
      uri: `${siteUrl}/wiki/pages/${parsed.id}`,
      label: `Confluence page ${parsed.id}`,
    };
  }
}
