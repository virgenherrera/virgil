import { Module } from "@nestjs/common";
import { BriefModule } from "../brief/brief.module.js";
import { ExecutionTrackerService } from "./execution-tracker.service.js";
import { HandoffService } from "./handoff.service.js";
import { HandoffStateMachine } from "./handoff-state-machine.js";

@Module({
  imports: [BriefModule],
  providers: [HandoffService, HandoffStateMachine, ExecutionTrackerService],
  exports: [HandoffService, HandoffStateMachine, ExecutionTrackerService],
})
export class HandoffModule {}
