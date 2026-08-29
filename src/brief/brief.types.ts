export type BriefKind =
  | "principle"
  | "constraint"
  | "risk"
  | "decision"
  | "glossary"
  | "open-question";

export interface BriefItem {
  readonly id: string;
  readonly kind: BriefKind;
  readonly title: string;
  readonly summary: string;
  readonly sourceRefs: readonly string[];
}

export interface Brief {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly watermark: string;
  readonly items: readonly BriefItem[];
  readonly stats: BriefStats;
}

export interface BriefStats {
  readonly totalDocuments: number;
  readonly totalItems: number;
  readonly byKind: Readonly<Record<BriefKind, number>>;
  readonly durationMs: number;
}
