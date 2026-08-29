import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option } from "nest-commander";
import { PollingLoopService } from "../reactive/polling-loop.service.js";
import { EventRouterService } from "../reactive/event-router.service.js";
import { EVENT_KIND } from "../reactive/event.types.js";

interface WatchOptions {
  readonly interval?: number;
}

@Command({
  name: "watch",
  description: "Start the reactive polling loop to watch for changes",
})
export class WatchCommand extends CommandRunner {
  constructor(
    @Inject(PollingLoopService)
    private readonly pollingLoop: PollingLoopService,
    @Inject(EventRouterService)
    private readonly eventRouter: EventRouterService,
  ) {
    super();
  }

  async run(_args: string[], options?: WatchOptions): Promise<void> {
    const intervalMs = (options?.interval ?? 30) * 1000;

    // Register default console handler for all event kinds
    for (const kind of Object.values(EVENT_KIND)) {
      this.eventRouter.on(kind, async (event) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        console.log(`[${time}] ${event.kind}: ${event.ref}`);

        if (event.payload) {
          for (const [key, value] of Object.entries(event.payload)) {
            console.log(`  ${key}: ${String(value)}`);
          }
        }
      });
    }

    console.log("Starting watch mode...");
    console.log("Press Ctrl+C to stop.\n");

    process.on("SIGINT", () => {
      this.pollingLoop.stop();
      process.exit(0);
    });

    await this.pollingLoop.start(intervalMs);
  }

  @Option({
    flags: "--interval <seconds>",
    description: "Polling interval in seconds (default: 30)",
  })
  parseInterval(val: string): number {
    return parseInt(val, 10);
  }
}
