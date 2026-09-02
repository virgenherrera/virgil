import type { z } from 'zod';
import type { HandoffStatus } from '../shared/handoff.types.js';

/**
 * Thrown when a handoff envelope fails Zod validation — either at
 * construction time (`HandoffProtocolFactory.create`) or at deserialization
 * time (`HandoffProtocolFactory.deserialize`). Carries the underlying Zod
 * issues so callers can report field-specific errors (H09 D1, D8).
 */
export class HandoffValidationError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(message: string, issues: readonly z.core.$ZodIssue[]) {
    super(message);
    this.name = 'HandoffValidationError';
    this.issues = issues;
  }
}

/**
 * Thrown when an attempted handoff status transition is not a legal edge of
 * the shared `HANDOFF_TRANSITIONS` finite state machine. Carries the current
 * status, the attempted target, and the full set of legal targets from the
 * current status, per H09 D2 ("typed error with the current status,
 * attempted target, and the set of valid targets").
 */
export class HandoffTransitionError extends Error {
  readonly current: HandoffStatus;
  readonly attempted: HandoffStatus;
  readonly validTargets: readonly HandoffStatus[];

  constructor(
    current: HandoffStatus,
    attempted: HandoffStatus,
    validTargets: readonly HandoffStatus[],
  ) {
    super(
      `Illegal handoff transition: "${current}" -> "${attempted}". ` +
        `Valid targets from "${current}": [${validTargets.join(', ') || '(none — terminal state)'}]`,
    );
    this.name = 'HandoffTransitionError';
    this.current = current;
    this.attempted = attempted;
    this.validTargets = validTargets;
  }
}

/**
 * Thrown when `HandoffProtocolFactory.deserialize` receives a string that is
 * not valid JSON. Wraps the original `SyntaxError` as `cause` so callers get
 * a typed error rather than an uncaught parser exception (H09 D8).
 */
export class HandoffSerializationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HandoffSerializationError';
  }
}
