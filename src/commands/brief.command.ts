import { Command, CommandRunner } from "nest-commander";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";

@Command({ name: "brief", description: "Generate dogma brief" })
export class BriefCommand extends CommandRunner {
  constructor(private readonly briefGenerator: BriefGeneratorService) {
    super();
  }

  async run(): Promise<void> {
    const brief = await this.briefGenerator.generate(process.cwd());

    console.log(
      `Brief generated: ${brief.stats.totalItems} items from ${brief.stats.totalDocuments} documents`,
    );
    console.log(`Watermark: ${brief.watermark}`);
    console.log(`Duration: ${brief.stats.durationMs}ms`);

    for (const [kind, count] of Object.entries(brief.stats.byKind)) {
      if (count > 0) console.log(`  ${kind}: ${count}`);
    }

    console.log(`\nSaved to .virgil/brief.json and .virgil/brief.md`);
  }
}
