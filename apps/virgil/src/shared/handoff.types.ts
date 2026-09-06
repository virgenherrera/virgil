import { z } from 'zod';
import type { Timestamp, Ulid } from './primitives.js';
import { TimestampSchema, UlidSchema } from './primitives.js';

export enum HandoffStatus {
  DRAFT = 'draft',
  READY = 'ready',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  REVIEW = 'review',
  DONE = 'done',
  ARCHIVED = 'archived',
}

export const HANDOFF_TRANSITIONS: Record<
  HandoffStatus,
  readonly HandoffStatus[]
> = {
  [HandoffStatus.DRAFT]: [HandoffStatus.READY],
  [HandoffStatus.READY]: [HandoffStatus.DRAFT, HandoffStatus.ASSIGNED],
  [HandoffStatus.ASSIGNED]: [HandoffStatus.IN_PROGRESS, HandoffStatus.BLOCKED],
  [HandoffStatus.IN_PROGRESS]: [HandoffStatus.BLOCKED, HandoffStatus.REVIEW],
  [HandoffStatus.BLOCKED]: [HandoffStatus.ASSIGNED, HandoffStatus.IN_PROGRESS],
  [HandoffStatus.REVIEW]: [HandoffStatus.IN_PROGRESS, HandoffStatus.DONE],
  [HandoffStatus.DONE]: [HandoffStatus.ARCHIVED],
  [HandoffStatus.ARCHIVED]: [],
};

export function isValidHandoffTransition(
  from: HandoffStatus,
  to: HandoffStatus,
): boolean {
  return HANDOFF_TRANSITIONS[from].includes(to);
}

export function assertValidHandoffTransition(
  from: HandoffStatus,
  to: HandoffStatus,
): void {
  if (!isValidHandoffTransition(from, to)) {
    throw new Error(`Invalid handoff transition: ${from} -> ${to}`);
  }
}

export interface HandoffEnvelope {
  readonly id: Ulid;
  readonly status: HandoffStatus;
  readonly title: string;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly parentId?: Ulid;
}

export const HandoffEnvelopeSchema = z.object({
  id: UlidSchema,
  status: z.nativeEnum(HandoffStatus),
  title: z.string().min(1, { error: 'Title must not be empty' }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  parentId: UlidSchema.optional(),
});

export type HandoffEnvelopeShape = z.infer<typeof HandoffEnvelopeSchema>;
