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
import { SlackHttpClientService } from "./slack-http-client.service.js";
import { SLACK_CONFIG_TOKEN, type SlackConfigType } from "./slack.config.js";
import type {
  ChatChannel,
  ChatMessage,
  ChatSnapshot,
} from "../chat.types.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_HISTORY_LIMIT = 20;

@Injectable()
export class SlackReaderService
  implements SnapshotProviderPort<ChatSnapshot>, OnModuleInit
{
  readonly kind: ProviderKind = "chat";
  readonly backendId = "slack";
  readonly capabilityId = "chat-slack";

  constructor(
    @Inject(SLACK_CONFIG_TOKEN)
    private readonly config: SlackConfigType,
    @Inject(SlackHttpClientService)
    private readonly http: SlackHttpClientService,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Slack channels: ${this.config.channels.join(", ")}`,
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
      await this.http.get<{ user_id: string }>("auth.test");
      return {
        status: "available",
        message: "Connected to Slack",
      };
    } catch (error) {
      return {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Slack",
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<ChatSnapshot>> {
    const channels: ChatChannel[] = [];
    const recentMessages: ChatMessage[] = [];
    const limit = scope.maxItems ?? DEFAULT_HISTORY_LIMIT;

    for (const channelId of this.config.channels) {
      try {
        const info = await this.fetchChannelInfo(channelId);
        channels.push(info);

        const messages = await this.fetchChannelHistory(channelId, limit);
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

    if (parsed.kind !== "chat" || parsed.backend !== "slack") {
      return { resolved: false };
    }

    const slashIndex = parsed.id.indexOf("/");
    if (slashIndex === -1) {
      return { resolved: false };
    }

    const channelId = parsed.id.slice(0, slashIndex);
    const messageTs = parsed.id.slice(slashIndex + 1);

    try {
      const response = await this.http.get<{
        messages: Array<{ ts: string; text: string; user?: string }>;
      }>("conversations.history", {
        channel: channelId,
        latest: messageTs,
        oldest: messageTs,
        inclusive: "true",
        limit: "1",
      });

      const msg = response.messages?.[0];
      if (!msg) {
        return { resolved: false };
      }

      return {
        resolved: true,
        uri: `https://slack.com/archives/${channelId}/p${messageTs.replace(".", "")}`,
        label: msg.text.slice(0, 100),
      };
    } catch {
      return { resolved: false };
    }
  }

  private async fetchChannelInfo(channelId: string): Promise<ChatChannel> {
    const response = await this.http.get<{
      channel: { id: string; name: string; num_members: number };
    }>("conversations.info", { channel: channelId });

    return {
      id: response.channel.id,
      name: response.channel.name,
      memberCount: response.channel.num_members,
    };
  }

  private async fetchChannelHistory(
    channelId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const response = await this.http.get<{
      messages: Array<{
        ts: string;
        text: string;
        user?: string;
        thread_ts?: string;
      }>;
    }>("conversations.history", {
      channel: channelId,
      limit: String(limit),
    });

    return (response.messages ?? []).map((msg) => ({
      ref: buildRef("chat", "slack", `${channelId}/${msg.ts}`),
      channel: channelId,
      author: msg.user ?? "unknown",
      text: msg.text,
      timestamp: msg.ts,
      threadTs: msg.thread_ts,
    }));
  }
}
