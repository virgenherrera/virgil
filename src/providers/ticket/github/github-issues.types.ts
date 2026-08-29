import type { SemanticRef } from "../../../domain/refs.js";

export interface GithubLabel {
  readonly name: string;
  readonly color: string;
}

export interface GithubMilestone {
  readonly number: number;
  readonly title: string;
  readonly state: string;
}

export interface GithubIssueBrief {
  readonly ref: SemanticRef;
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly assignee: string | null;
  readonly labels: readonly GithubLabel[];
  readonly milestone: GithubMilestone | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GithubIssueDetail extends GithubIssueBrief {
  readonly body: string | null;
  readonly closedAt: string | null;
  readonly comments: number;
}

export interface GithubIssueSnapshot {
  readonly owner: string;
  readonly repo: string;
  readonly issues: readonly GithubIssueBrief[];
}
