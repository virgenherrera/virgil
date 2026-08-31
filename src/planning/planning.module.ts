import { Module } from "@nestjs/common";
import { PlanningService } from "./planning.service.js";

@Module({
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
