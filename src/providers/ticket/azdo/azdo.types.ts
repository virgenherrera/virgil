import type { SemanticRef } from "../../../domain/refs.js";

export interface AzdoWorkItemBrief {
  readonly ref: SemanticRef;
  readonly id: number;
  readonly title: string;
  readonly state: string;
  readonly assignedTo: string | null;
  readonly workItemType: string;
  readonly areaPath: string;
  readonly iterationPath: string;
  readonly createdDate: string;
  readonly changedDate: string;
}

export interface AzdoWorkItemSnapshot {
  readonly orgUrl: string;
  readonly project: string;
  readonly workItems: readonly AzdoWorkItemBrief[];
}
