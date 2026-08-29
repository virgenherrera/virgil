import { Injectable } from "@nestjs/common";
import type { EventKind, VirgilEvent } from "./event.types.js";

export type EventHandler = (event: VirgilEvent) => Promise<void>;

@Injectable()
export class EventRouterService {
  private readonly handlers = new Map<EventKind, EventHandler[]>();

  on(kind: EventKind, handler: EventHandler): void {
    const existing = this.handlers.get(kind) ?? [];
    existing.push(handler);
    this.handlers.set(kind, existing);
  }

  async route(event: VirgilEvent): Promise<void> {
    const handlers = this.handlers.get(event.kind) ?? [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(
          `Event handler error for ${event.kind}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
