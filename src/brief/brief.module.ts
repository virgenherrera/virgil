import { Module } from "@nestjs/common";
import { BriefGeneratorService } from "./brief-generator.service.js";

@Module({
  providers: [BriefGeneratorService],
  exports: [BriefGeneratorService],
})
export class BriefModule {}
