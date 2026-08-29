import { Injectable } from "@nestjs/common";
import type { Insight, InsightAnalyzerPort } from "./insight.types.js";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

@Injectable()
export class InsightEngineService {
  private readonly analyzers: InsightAnalyzerPort[] = [];

  registerAnalyzer(analyzer: InsightAnalyzerPort): void {
    this.analyzers.push(analyzer);
  }

  async runAll(): Promise<Insight[]> {
    const all: Insight[] = [];

    for (const analyzer of this.analyzers) {
      try {
        const insights = await analyzer.analyze();
        all.push(...insights);
      } catch (error) {
        console.error(
          `Analyzer ${analyzer.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    all.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) -
        (SEVERITY_ORDER[b.severity] ?? 3),
    );

    return all;
  }
}
