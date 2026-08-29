import { Module } from "@nestjs/common";
import { CursorStoreService } from "./cursor-store.service.js";
import { EventRouterService } from "./event-router.service.js";
import { PollingLoopService } from "./polling-loop.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";

@Module({
  imports: [ProviderRegistryModule],
  providers: [CursorStoreService, EventRouterService, PollingLoopService],
  exports: [CursorStoreService, EventRouterService, PollingLoopService],
})
export class ReactiveModule {}
