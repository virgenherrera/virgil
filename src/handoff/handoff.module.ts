import { Module } from "@nestjs/common";
import { BriefModule } from "../brief/brief.module.js";
import { HandoffService } from "./handoff.service.js";
import { HandoffStateMachine } from "./handoff-state-machine.js";

@Module({
  imports: [BriefModule],
  providers: [HandoffService, HandoffStateMachine],
  exports: [HandoffService, HandoffStateMachine],
})
export class HandoffModule {}
