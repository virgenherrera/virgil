import { Module } from "@nestjs/common";
import { HandoffService } from "./handoff.service.js";
import { HandoffStateMachine } from "./handoff-state-machine.js";

@Module({
  providers: [HandoffService, HandoffStateMachine],
  exports: [HandoffService, HandoffStateMachine],
})
export class HandoffModule {}
