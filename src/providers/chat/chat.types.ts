import type { SemanticRef } from "../../domain/refs.js";

export interface ChatMessage {
  readonly ref: SemanticRef;
  readonly channel: string;
  readonly author: string;
  readonly text: string;
  readonly timestamp: string;
  readonly threadTs?: string;
}

export interface ChatChannel {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
}

export interface ChatSnapshot {
  readonly channels: readonly ChatChannel[];
  readonly recentMessages: readonly ChatMessage[];
}
