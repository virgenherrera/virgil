import { Inject } from "@nestjs/common";
import { SubCommand, CommandRunner, Option } from "nest-commander";
import { HandoffStateMachine } from "../handoff/handoff-state-machine.js";
import { HANDOFF_STATE } from "../handoff/handoff.types.js";
import type { HandoffState } from "../handoff/handoff.types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDOFFS_DIR = ".virgil/handoffs";

interface TransitionOptions {
  breakGlass?: boolean;
  reason?: string;
}

@SubCommand({
  name: "transition",
  arguments: "<handoff-id> <target-state>",
  description: "Transition a handoff to a new lifecycle state",
})
export class HandoffTransitionCommand extends CommandRunner {
  constructor(
    @Inject(HandoffStateMachine)
    private readonly stateMachine: HandoffStateMachine,
  ) {
    super();
  }

  async run(args: string[], options?: TransitionOptions): Promise<void> {
    const handoffId = args[0];
    const targetStateArg = args[1];

    if (!handoffId || !targetStateArg) {
      console.error(
        "Usage: virgil handoff transition <handoff-id> <target-state> [--break-glass] [--reason <text>]",
      );
      return;
    }

    const validStates = Object.values(HANDOFF_STATE) as string[];
    if (!validStates.includes(targetStateArg)) {
      console.error(
        `Invalid state: ${targetStateArg}. Valid states: ${validStates.join(", ")}`,
      );
      return;
    }

    const targetState = targetStateArg as HandoffState;

    // Show current state
    const metaPath = resolve(
      process.cwd(),
      HANDOFFS_DIR,
      handoffId,
      "META.json",
    );

    let currentState: string;
    try {
      const raw = readFileSync(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      currentState = meta.state;
    } catch {
      console.error(`Failed to read handoff: ${handoffId}`);
      return;
    }

    console.log(`\nTransition: ${handoffId}`);
    console.log("=".repeat(40));
    console.log(`  Current state: ${currentState}`);
    console.log(`  Target state:  ${targetState}`);

    if (options?.breakGlass) {
      console.log(`  Break-glass:   ACTIVE`);
      console.log(
        `  Reason:        ${options.reason ?? "No reason provided"}`,
      );
    }

    try {
      const updated = await this.stateMachine.transition(
        handoffId,
        targetState,
        {
          breakGlass: options?.breakGlass,
          reason: options?.reason,
        },
      );

      console.log(`\n  Transition successful.`);
      console.log(`  New state: ${updated.state}`);

      if (updated.breakGlass) {
        console.log(
          `\n  WARNING: Break-glass activated.`,
        );
        console.log(
          `  Certification deadline: ${updated.breakGlass.certificationDeadline}`,
        );
      }

      console.log("");
    } catch (error) {
      console.error(
        `\n  Transition failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: "--break-glass",
    description: "Activate break-glass override (skips precondition checks)",
  })
  parseBreakGlass(): boolean {
    return true;
  }

  @Option({
    flags: "--reason <text>",
    description: "Reason for the transition or break-glass override",
  })
  parseReason(val: string): string {
    return val;
  }
}
