import { Inject, Injectable } from "@nestjs/common";
import type { SnapshotProviderPort } from "../../ports/context-provider.port.js";
import { ProviderRegistryService } from "../../providers/provider-registry.service.js";
import type { Insight, InsightAnalyzerPort } from "../insight.types.js";

@Injectable()
export class StaleTicketAnalyzer implements InsightAnalyzerPort {
  readonly name = "stale-tickets";

  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async analyze(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const ticketProviders = this.providerRegistry.getByKind("ticket");

    for (const provider of ticketProviders) {
      const snapshotProvider = provider as SnapshotProviderPort<unknown>;
      if (!("snapshot" in snapshotProvider)) continue;

      try {
        const result = await snapshotProvider.snapshot({ maxItems: 50 });
        const data = result.data;

        if (data && typeof data === "object" && "issues" in data) {
          const issues = (
            data as {
              issues: readonly {
                ref: string;
                key: string;
                summary: string;
                status: string;
              }[];
            }
          ).issues;

          const stale = issues.filter((i) => {
            const status = i.status.toLowerCase();
            return status === "to do" || status === "open";
          });

          if (stale.length > 0) {
            insights.push({
              id: `stale-${provider.capabilityId}-${Date.now()}`,
              title: `${stale.length} stale ticket(s) in sprint`,
              description: `Tickets still in "To Do"/"Open" status: ${stale.map((i) => i.key).join(", ")}`,
              severity: stale.length > 3 ? "warning" : "info",
              source: this.name,
              refs: stale.map((i) => i.ref),
              generatedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        // skip provider on error
      }
    }

    return insights;
  }
}
