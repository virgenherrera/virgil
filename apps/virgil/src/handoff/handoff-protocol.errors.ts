import type { z } from 'zod';
import type { HandoffStatus } from '../shared/handoff.types.js';

export class HandoffValidationError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(message: string, issues: readonly z.core.$ZodIssue[]) {
    super(message);
    this.name = 'HandoffValidationError';
    this.issues = issues;
  }
}

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

export class HandoffSerializationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HandoffSerializationError';
  }
}
