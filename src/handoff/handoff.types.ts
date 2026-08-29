export const HANDOFF_STATE = {
  DRAFT: "draft",
  HANDOFF: "handoff",
  EXECUTION: "execution",
  VERIFY: "verify",
  DELIVERED: "delivered",
} as const;

export type HandoffState = (typeof HANDOFF_STATE)[keyof typeof HANDOFF_STATE];

export interface BreakGlassInfo {
  readonly activatedAt: string;
  readonly reason: string;
  readonly certificationDeadline: string;
}

export interface HandoffMeta {
  readonly id: string;
  readonly schemaVersion: string;
  readonly state: HandoffState;
  readonly ticketKey: string;
  readonly ffLevel: 1 | 2 | 3 | 4;
  readonly generatedAt: string;
  readonly repos: readonly RepoBaseline[];
  readonly guardrails: Guardrails;
  readonly breakGlass?: BreakGlassInfo;
}

export interface RepoBaseline {
  readonly repoPath: string;
  readonly branch: string;
  readonly commitSha: string;
}

export interface Guardrails {
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly maxFilesChanged: number;
  readonly maxLinesChanged: number;
}

export interface HandoffOptions {
  readonly ffLevel?: 1 | 2 | 3 | 4;
  readonly repoPath?: string;
  readonly allowedPaths?: string[];
  readonly forbiddenPaths?: string[];
  readonly maxFilesChanged?: number;
  readonly maxLinesChanged?: number;
}

export const GAP_TYPE = {
  IMPLEMENTATION: "implementation",
  TESTING: "testing",
  CONTRACT: "contract",
  COMPLIANCE: "compliance",
} as const;

export type GapType = (typeof GAP_TYPE)[keyof typeof GAP_TYPE];

export interface AuditResult {
  readonly handoffId: string;
  readonly verdict: "PASS" | "WARN" | "FAIL";
  readonly checks: readonly AuditCheck[];
  readonly auditedAt: string;
  readonly recommendation?: string;
}

export interface AuditCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly gapType?: GapType;
}
