export const DOC_KIND = {
  IDEA: "idea",
  REQUIREMENT: "requirement",
  DESIGN: "design",
  TASK: "task",
} as const;

export type DocKind = (typeof DOC_KIND)[keyof typeof DOC_KIND];

export const TASK_STATUS = {
  BACKLOG: "backlog",
  REFINED: "refined",
  ACTIVE: "active",
  DONE: "done",
  RELEASED: "released",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const DOC_SCHEMA = "virgil.dev/doc/v1alpha1";

export interface DocRefs {
  readonly requirements: readonly string[];
  readonly design: readonly string[];
  readonly implements: readonly string[];
}

export interface DocRefsUpdate {
  readonly requirements?: readonly string[];
  readonly design?: readonly string[];
  readonly implements?: readonly string[];
}

export interface DocMeta {
  readonly schema: string;
  readonly doc_kind: DocKind;
  readonly project_id: string;
  readonly slug: string;
  readonly status: TaskStatus | null;
  readonly category: string | null;
  readonly refs: DocRefs;
  readonly content_digest: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Document {
  readonly meta: DocMeta;
  readonly content: string;
  readonly filePath: string;
}

export interface WriteDocParams {
  readonly kind: DocKind;
  readonly slug?: string;
  readonly category?: string | null;
  readonly content: string;
  readonly status?: TaskStatus;
  readonly refs?: DocRefsUpdate;
}

export interface TransitionResult {
  readonly slug: string;
  readonly oldStatus: TaskStatus;
  readonly newStatus: TaskStatus;
  readonly filePath: string;
  readonly document: Document;
  readonly allTasksRefined: boolean;
}

export interface ProjectState {
  readonly docCounts: Record<DocKind, number>;
  readonly taskCounts: Record<TaskStatus, number>;
  readonly allTasksRefined: boolean;
}
