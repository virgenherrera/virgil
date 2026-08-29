import { Command, CommandRunner } from "nest-commander";
import { HandoffCreateCommand } from "./handoff-create.command.js";
import { HandoffListCommand } from "./handoff-list.command.js";
import { HandoffPhaseCommand } from "./handoff-phase.command.js";
import { HandoffShowCommand } from "./handoff-show.command.js";
import { HandoffTransitionCommand } from "./handoff-transition.command.js";

@Command({
  name: "handoff",
  description: "Manage handoffs for AI agent delegation",
  subCommands: [
    HandoffCreateCommand,
    HandoffListCommand,
    HandoffPhaseCommand,
    HandoffShowCommand,
    HandoffTransitionCommand,
  ],
})
export class HandoffCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log("Usage: virgil handoff <create|list|show|phase|transition>");
  }
}
