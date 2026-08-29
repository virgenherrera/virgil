import { Global, Module } from "@nestjs/common";
import { ProviderRegistryService } from "./provider-registry.service.js";

@Global()
@Module({
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class ProviderRegistryModule {}
