import { z } from 'zod';
import type { Timestamp, Ulid } from '../shared/primitives.js';
import { REJECTION_REASONS } from './orchestration.constants.js';
import type { RejectionReason } from './orchestration.constants.js';
import type { AgentState, TransitionRecord } from './agent-lifecycle.js';
import type { TaskEnvelope } from './task-envelope.schema.js';

/** Structured reason an agent provides when rejecting its assignment (H10 D4). */
export interface RejectionResponse {
  readonly reason: RejectionReason;
  readonly explanation?: string;
}

/**
 * Validates a rejection response. When the reason is `'other'`, a free-text
 * explanation is mandatory.
 */
export const RejectionResponseSchema = z
  .object({
    reason: z.enum(REJECTION_REASONS),
    explanation: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.reason === 'other' && !val.explanation) {
      ctx.addIssue({
        code: 'custom',
        message: "Explanation required when reason is 'other'",
      });
    }
  });

/** Structured output produced by an agent upon completion. */
export interface AgentResult {
  readonly agentName: string;
  readonly deliverables: readonly string[];
  readonly evidence: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Validates the shape of an {@link AgentResult}. */
export const AgentResultSchema = z
  .object({
    agentName: z.string().min(1),
    deliverables: z.array(z.string().min(1)),
    evidence: z.array(z.string().min(1)),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Runtime representation of a dispatched agent within an orchestration session. */
export interface AgentInstance {
  readonly id: Ulid;
  readonly sessionId: Ulid;
  readonly envelope: TaskEnvelope;
  readonly state: AgentState;
  readonly transitions: readonly TransitionRecord[];
  readonly createdAt: Timestamp;
  readonly rejectionReason?: RejectionResponse;
  readonly result?: AgentResult;
}
