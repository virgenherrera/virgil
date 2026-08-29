import { Module } from "@nestjs/common";
import { BriefGeneratorService } from "./brief-generator.service.js";
import { BriefQueryService } from "./brief-query.service.js";

@Module({
  providers: [BriefGeneratorService, BriefQueryService],
  exports: [BriefGeneratorService, BriefQueryService],
})
export class BriefModule {}
