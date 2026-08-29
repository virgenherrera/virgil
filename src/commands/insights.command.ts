import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { InsightEngineService } from "../proactive/insight-engine.service.js";

@Command({
  name: "insights",
  description: "Run proactive analyzers and display insights",
})
export class InsightsCommand extends CommandRunner {
  constructor(
    @Inject(InsightEngineService)
    private readonly engine: InsightEngineService,
  ) {
    super();
  }

  async run(): Promise<void> {
    console.log("\nRunning analyzers...\n");

    const insights = await this.engine.runAll();

    if (insights.length === 0) {
      console.log("No insights generated. Everything looks good.");
      return;
    }

    console.log(`Found ${insights.length} insight(s):\n`);

    for (const insight of insights) {
      const severityLabel = insight.severity.toUpperCase();
      console.log(`  [${severityLabel}] ${insight.title}`);
      console.log(`    ${insight.description}`);
      if (insight.refs.length > 0) {
        console.log(`    Refs: ${insight.refs.join(", ")}`);
      }
      console.log("");
    }
  }
}
