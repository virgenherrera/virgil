import { Inject, Injectable } from "@nestjs/common";
import type { SnapshotProviderPort } from "../../ports/context-provider.port.js";
import { ProviderRegistryService } from "../../providers/provider-registry.service.js";
import type { Insight, InsightAnalyzerPort } from "../insight.types.js";

interface RepoSnapshot {
  readonly ref: string;
  readonly name: string;
  readonly uncommittedChanges: number;
  readonly branch: string;
}

@Injectable()
export class UncommittedChangesAnalyzer implements InsightAnalyzerPort {
  readonly name = "uncommitted-changes";

  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async analyze(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sourceProviders = this.providerRegistry.getByKind("sourcecode");

    for (const provider of sourceProviders) {
      const snapshotProvider = provider as SnapshotProviderPort<unknown>;
      if (!("snapshot" in snapshotProvider)) continue;

      try {
        const result = await snapshotProvider.snapshot({ maxItems: 20 });
        const repos = result.data as readonly RepoSnapshot[];

        if (!Array.isArray(repos)) continue;

        for (const repo of repos) {
          if (repo.uncommittedChanges > 0) {
            insights.push({
              id: `uncommitted-${repo.name}-${Date.now()}`,
              title: `Uncommitted changes in ${repo.name}`,
              description: `${repo.uncommittedChanges} uncommitted change(s) on branch ${repo.branch}`,
              severity: repo.uncommittedChanges > 10 ? "warning" : "info",
              source: this.name,
              refs: [repo.ref],
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
