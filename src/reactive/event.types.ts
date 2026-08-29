export const EVENT_KIND = {
  TICKET_UPDATED: "ticket-updated",
  TICKET_CREATED: "ticket-created",
  COMMIT_PUSHED: "commit-pushed",
  DOC_CHANGED: "doc-changed",
  MEMBER_CHANGED: "member-changed",
} as const;

export type EventKind = (typeof EVENT_KIND)[keyof typeof EVENT_KIND];

export interface VirgilEvent {
  readonly kind: EventKind;
  readonly ref: string;
  readonly timestamp: string;
  readonly source: string;
  readonly payload: Record<string, unknown>;
}

export interface EventCursor {
  readonly providerId: string;
  readonly lastSeen: string;
}
