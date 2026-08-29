import type { SemanticRef } from "../../../domain/refs.js";

export interface JiraBoard {
  readonly id: number;
  readonly name: string;
  readonly type: string;
}

export interface JiraSprint {
  readonly id: number;
  readonly name: string;
  readonly state: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface JiraIssueBrief {
  readonly ref: SemanticRef;
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly priority: string;
  readonly labels: readonly string[];
  readonly parentKey: string | null;
}

export interface JiraSnapshot {
  readonly board: JiraBoard;
  readonly activeSprint: JiraSprint | null;
  readonly issues: readonly JiraIssueBrief[];
}

export interface JiraIssueDetail extends JiraIssueBrief {
  readonly description: string | null;
  readonly issueType: string;
  readonly created: string;
  readonly updated: string;
}
