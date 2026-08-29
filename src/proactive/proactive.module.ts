import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { InsightEngineService } from "./insight-engine.service.js";
import { StaleTicketAnalyzer } from "./analyzers/stale-ticket.analyzer.js";
import { UncommittedChangesAnalyzer } from "./analyzers/uncommitted-changes.analyzer.js";

@Module({
  imports: [ProviderRegistryModule],
  providers: [
    InsightEngineService,
    StaleTicketAnalyzer,
    UncommittedChangesAnalyzer,
  ],
  exports: [InsightEngineService],
})
export class ProactiveModule implements OnModuleInit {
  constructor(
    @Inject(InsightEngineService)
    private readonly engine: InsightEngineService,
    @Inject(StaleTicketAnalyzer)
    private readonly staleTickets: StaleTicketAnalyzer,
    @Inject(UncommittedChangesAnalyzer)
    private readonly uncommitted: UncommittedChangesAnalyzer,
  ) {}

  onModuleInit(): void {
    this.engine.registerAnalyzer(this.staleTickets);
    this.engine.registerAnalyzer(this.uncommitted);
  }
}
