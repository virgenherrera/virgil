import { Command, CommandRunner, Option } from "nest-commander";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { BriefQueryService } from "../brief/brief-query.service.js";
import type { BriefKind, BriefQueryOptions } from "../brief/brief.types.js";

interface BriefOptions {
  readonly kind?: BriefKind[];
  readonly search?: string;
  readonly checkDrift?: boolean;
}

@Command({ name: "brief", description: "Generate or query dogma brief" })
export class BriefCommand extends CommandRunner {
  constructor(
    private readonly briefGenerator: BriefGeneratorService,
    private readonly briefQuery: BriefQueryService,
  ) {
    super();
  }

  async run(_args: string[], options?: BriefOptions): Promise<void> {
    const isQueryMode =
      options?.kind !== undefined ||
      options?.search !== undefined ||
      options?.checkDrift === true;

    if (isQueryMode) {
      await this.runQuery(options!);
    } else {
      await this.runGenerate();
    }
  }

  private async runGenerate(): Promise<void> {
    const brief = await this.briefGenerator.generate(process.cwd());

    console.log(
      `Brief generated: ${brief.stats.totalItems} items from ${brief.stats.totalDocuments} documents`,
    );
    console.log(`Watermark: ${brief.watermark}`);
    console.log(`Duration: ${brief.stats.durationMs}ms`);

    for (const [kind, count] of Object.entries(brief.stats.byKind)) {
      if (count > 0) console.log(`  ${kind}: ${count}`);
    }

    console.log(`\nSaved to .virgil/brief.json and .virgil/brief.md`);
  }

  private async runQuery(options: BriefOptions): Promise<void> {
    const cwd = process.cwd();

    if (options.checkDrift) {
      const drift = await this.briefQuery.checkDrift(cwd);
      if (drift.drifted) {
        console.log(
          `⚠ Brief is stale: ${drift.commitsBehind} commit(s) behind HEAD`,
        );
        console.log(`  Watermark: ${drift.watermark}`);
        console.log(`  HEAD:      ${drift.head}`);
      } else {
        console.log("Brief is up to date.");
      }
    }

    if (options.kind !== undefined || options.search !== undefined) {
      const queryOptions: BriefQueryOptions = {
        kinds: options.kind,
        search: options.search,
      };

      const result = await this.briefQuery.query(cwd, queryOptions);

      console.log(
        `\nMatched ${result.stats.matched} of ${result.stats.total} items`,
      );

      // Group items by kind
      const grouped = new Map<BriefKind, typeof result.items>();
      for (const item of result.items) {
        const existing = grouped.get(item.kind) ?? [];
        grouped.set(item.kind, [...existing, item]);
      }

      for (const [kind, items] of grouped) {
        console.log(`\n## ${kind} (${items.length})`);
        for (const item of items) {
          console.log(`  - ${item.title}`);
          console.log(`    ${item.summary}`);
        }
      }
    }
  }

  @Option({
    flags: "--kind <kind>",
    description: "Filter by brief kind (can be repeated or comma-separated)",
  })
  parseKind(val: string, previous?: BriefKind[]): BriefKind[] {
    const kinds = val.split(",").map((k) => k.trim()) as BriefKind[];
    return [...(previous ?? []), ...kinds];
  }

  @Option({
    flags: "--search <text>",
    description: "Text search on title and summary",
  })
  parseSearch(val: string): string {
    return val;
  }

  @Option({
    flags: "--check-drift",
    description: "Show drift warning if brief is stale",
  })
  parseCheckDrift(): boolean {
    return true;
  }
}
