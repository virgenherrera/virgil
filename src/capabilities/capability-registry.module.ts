import { Global, Module } from "@nestjs/common";
import { CapabilityRegistryService } from "./capability-registry.service.js";

@Global()
@Module({
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class CapabilityRegistryModule {}
