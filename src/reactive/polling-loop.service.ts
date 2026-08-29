import { Inject, Injectable } from "@nestjs/common";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import type { ObservableProviderPort } from "../ports/context-provider.port.js";
import { CursorStoreService } from "./cursor-store.service.js";
import { EventRouterService } from "./event-router.service.js";
import type { VirgilEvent } from "./event.types.js";

@Injectable()
export class PollingLoopService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
    @Inject(CursorStoreService)
    private readonly cursorStore: CursorStoreService,
    @Inject(EventRouterService)
    private readonly eventRouter: EventRouterService,
  ) {}

  async start(intervalMs: number = 30_000): Promise<void> {
    console.log(`Polling loop started (interval: ${intervalMs / 1000}s)`);
    await this.tick();
    this.intervalId = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Polling loop stopped");
    }
  }

  async tick(): Promise<void> {
    const providers = this.providerRegistry.getAll();

    for (const provider of providers) {
      if (!this.isObservable(provider)) continue;

      const cursor = await this.cursorStore.getCursor(provider.capabilityId);
      const since = cursor
        ? new Date(cursor.lastSeen)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      try {
        const observable = provider.poll(since);
        const events: VirgilEvent[] = [];

        await new Promise<void>((resolve, reject) => {
          observable.subscribe({
            next: (event) => events.push(event.payload),
            error: reject,
            complete: resolve,
          });
        });

        for (const event of events) {
          await this.eventRouter.route(event);
        }

        if (events.length > 0) {
          const latest = events.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b,
          );
          await this.cursorStore.updateCursor(
            provider.capabilityId,
            new Date(latest.timestamp),
          );
        }
      } catch (error) {
        console.error(
          `Poll error for ${provider.capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private isObservable(
    provider: unknown,
  ): provider is ObservableProviderPort<VirgilEvent> {
    return typeof (provider as Record<string, unknown>).poll === "function";
  }
}
