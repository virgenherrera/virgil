import { SubCommand, CommandRunner } from "nest-commander";
import { ExecutionTrackerService } from "../handoff/execution-tracker.service.js";
import type { ExecutionPhase } from "../handoff/execution-tracker.types.js";

@SubCommand({ name: "phase", description: "Advance execution sub-phase" })
export class HandoffPhaseCommand extends CommandRunner {
  constructor(private readonly tracker: ExecutionTrackerService) {
    super();
  }

  async run(args: string[]): Promise<void> {
    const [handoffId, targetPhase] = args;
    if (!handoffId) {
      console.log("Usage: virgil handoff phase <handoff-id> [target-phase]");
      return;
    }

    if (!targetPhase) {
      const current = this.tracker.currentPhase(handoffId);
      console.log(`Current phase: ${current}`);
      return;
    }

    const meta = await this.tracker.advancePhase(
      handoffId,
      targetPhase as ExecutionPhase,
    );
    console.log(`Phase advanced: ${targetPhase}`);
    console.log(`Handoff: ${meta.id} (state: ${meta.state})`);
  }
}
