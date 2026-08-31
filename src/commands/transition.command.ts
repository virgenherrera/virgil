import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option } from "nest-commander";

import { PlanningService } from "../planning/planning.service.js";
import { TASK_STATUS } from "../planning/planning.types.js";
import type { TaskStatus } from "../planning/planning.types.js";

interface TransitionOptions {
  task?: string;
  status?: TaskStatus;
  req?: string[];
  design?: string[];
  implements?: string[];
}

@Command({
  name: "transition",
  description: "Transition a task to a new lifecycle status",
})
export class TransitionCommand extends CommandRunner {
  constructor(
    @Inject(PlanningService)
    private readonly planningService: PlanningService,
  ) {
    super();
  }

  async run(_args: string[], options?: TransitionOptions): Promise<void> {
    if (!options?.task || !options.status) {
      console.error(
        "Usage: virgil transition --task <slug> --status <backlog|refined|active|done|released>",
      );
      return;
    }

    try {
      const result = this.planningService.transition(
        options.task,
        options.status,
        {
          requirements: options.req,
          design: options.design,
          implements: options.implements,
        },
      );

      console.log(`\nTransition: ${result.slug}`);
      console.log("=".repeat(40));
      console.log(`  ${result.oldStatus} -> ${result.newStatus}`);
      console.log(`  File: ${result.filePath}`);

      if (result.allTasksRefined) {
        console.log(
          `\n  All tasks have reached 'refined' — planning complete.`,
        );
      }

      console.log("");
    } catch (error) {
      console.error(
        `Transition failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: "--task <slug>",
    description: "Task slug",
    required: true,
  })
  parseTask(val: string): string {
    return val;
  }

  @Option({
    flags: "--status <status>",
    description: "Target status",
    choices: Object.values(TASK_STATUS),
    required: true,
  })
  parseStatus(val: string): TaskStatus {
    return val as TaskStatus;
  }

  @Option({
    flags: "--req <slug>",
    description: "Requirement ref (repeatable)",
  })
  parseReq(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }

  @Option({
    flags: "--design <slug>",
    description: "Design ref (repeatable)",
  })
  parseDesign(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }

  @Option({
    flags: "--implements <path>",
    description: "Implementation source path ref (repeatable)",
  })
  parseImplements(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }
}
