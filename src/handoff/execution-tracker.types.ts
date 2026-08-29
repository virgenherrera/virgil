export const EXECUTION_PHASE = {
  PRE_PHASE: "pre-phase",
  RED: "red",
  GREEN: "green",
  REFACTOR: "refactor",
  VERIFY: "verify",
} as const;

export type ExecutionPhase =
  (typeof EXECUTION_PHASE)[keyof typeof EXECUTION_PHASE];

export const VALID_PHASE_TRANSITIONS: Record<
  ExecutionPhase,
  readonly ExecutionPhase[]
> = {
  "pre-phase": ["red"],
  red: ["green"],
  green: ["refactor"],
  refactor: ["verify"],
  verify: ["red"], // cycle back for next iteration
};
