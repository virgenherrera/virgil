import { TASK_STATUS } from "./planning.types.js";
import type { TaskStatus } from "./planning.types.js";

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  [TASK_STATUS.BACKLOG]: [TASK_STATUS.REFINED],
  [TASK_STATUS.REFINED]: [TASK_STATUS.ACTIVE, TASK_STATUS.BACKLOG],
  [TASK_STATUS.ACTIVE]: [TASK_STATUS.DONE, TASK_STATUS.REFINED],
  [TASK_STATUS.DONE]: [TASK_STATUS.RELEASED, TASK_STATUS.ACTIVE],
  [TASK_STATUS.RELEASED]: [],
};

export interface TaskTransitionCheck {
  readonly allowed: boolean;
  readonly reason: string;
}

export function checkTaskTransition(
  currentStatus: TaskStatus,
  targetStatus: TaskStatus,
): TaskTransitionCheck {
  const allowedTargets = TASK_TRANSITIONS[currentStatus];

  if (currentStatus === targetStatus) {
    return {
      allowed: false,
      reason: `Task is already in status '${currentStatus}'`,
    };
  }

  if (!allowedTargets.includes(targetStatus)) {
    return {
      allowed: false,
      reason:
        allowedTargets.length > 0
          ? `Invalid transition: ${currentStatus} -> ${targetStatus}. Valid targets: ${allowedTargets.join(", ")}`
          : `Invalid transition: ${currentStatus} -> ${targetStatus}. '${currentStatus}' is a terminal state.`,
    };
  }

  return { allowed: true, reason: "Transition allowed" };
}
