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
import { TeamsHttpClientService } from "./teams-http-client.service.js";
import { TEAMS_CONFIG_TOKEN, type TeamsConfigType } from "./teams.config.js";
import type {
  ChatChannel,
  ChatMessage,
  ChatSnapshot,
} from "../chat.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_HISTORY_LIMIT = 20;

@Injectable()
export class TeamsReaderService
  implements SnapshotProviderPort<ChatSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "chat";
  readonly backendId = "teams";
  readonly capabilityId = "chat-teams";

  constructor(
    @Inject(TEAMS_CONFIG_TOKEN)
    private readonly config: TeamsConfigType,
    @Inject(TeamsHttpClientService)
    private readonly http: TeamsHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Teams channels for team ${this.config.teamId}`,
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
      await this.http.get<{ displayName: string }>("/me");
      return {
        status: "available",
        message: "Connected to Microsoft Teams",
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Teams",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<ChatSnapshot>> {
    const channels: ChatChannel[] = [];
    const recentMessages: ChatMessage[] = [];
    const limit = scope.maxItems ?? DEFAULT_HISTORY_LIMIT;

    for (const channelId of this.config.channelIds) {
      try {
        const info = await this.fetchChannelInfo(channelId);
        channels.push(info);
        const messages = await this.fetchChannelMessages(channelId, limit);
        recentMessages.push(...messages);
      } catch {
        // skip unavailable channels
      }
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: { channels, recentMessages },
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "chat" || parsed.backend !== "teams") {
      return { resolved: false };
    }

    const slashIndex = parsed.id.indexOf("/");
    if (slashIndex === -1) return { resolved: false };

    const channelId = parsed.id.slice(0, slashIndex);
    const messageId = parsed.id.slice(slashIndex + 1);

    return {
      resolved: true,
      uri: `https://teams.microsoft.com/l/message/${channelId}/${messageId}?tenantId=default`,
    };
  }

  private async fetchChannelInfo(channelId: string): Promise<ChatChannel> {
    const response = await this.http.get<{
      id: string;
      displayName: string;
      membershipType: string;
    }>(`/teams/${this.config.teamId}/channels/${channelId}`);

    return {
      id: response.id,
      name: response.displayName,
      memberCount: 0,
    };
  }

  private async fetchChannelMessages(
    channelId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const response = await this.http.get<{
      value: Array<{
        id: string;
        from?: { user?: { displayName?: string } };
        body?: { content?: string };
        createdDateTime: string;
      }>;
    }>(
      `/teams/${this.config.teamId}/channels/${channelId}/messages?$top=${limit}`,
    );

    return (response.value ?? []).map((msg) => ({
      ref: buildRef("chat", "teams", `${channelId}/${msg.id}`),
      channel: channelId,
      author: msg.from?.user?.displayName ?? "unknown",
      text: msg.body?.content ?? "",
      timestamp: msg.createdDateTime,
    }));
  }
}
