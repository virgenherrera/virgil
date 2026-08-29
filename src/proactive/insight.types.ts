export const INSIGHT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export type InsightSeverity =
  (typeof INSIGHT_SEVERITY)[keyof typeof INSIGHT_SEVERITY];

export interface Insight {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: InsightSeverity;
  readonly source: string;
  readonly refs: readonly string[];
  readonly generatedAt: string;
}

export interface InsightAnalyzerPort {
  readonly name: string;
  analyze(): Promise<Insight[]>;
}
