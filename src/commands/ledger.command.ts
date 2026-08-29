import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option } from "nest-commander";
import { LedgerService } from "../ledger/ledger.service.js";

interface LedgerOptions {
  handoff?: string;
}

@Command({
  name: "ledger",
  description: "Show the Virgil ledger entries",
})
export class LedgerCommand extends CommandRunner {
  constructor(
    @Inject(LedgerService)
    private readonly ledgerService: LedgerService,
  ) {
    super();
  }

  async run(_args: string[], options?: LedgerOptions): Promise<void> {
    try {
      const entries = await this.ledgerService.getEntries(options?.handoff);

      if (entries.length === 0) {
        console.log("No ledger entries found.");
        return;
      }

      console.log(`\nLedger${options?.handoff ? ` (filtered: ${options.handoff})` : ""}:`);
      console.log("=".repeat(60));

      for (const entry of entries) {
        const time = entry.timestamp.replace("T", " ").slice(0, 19);
        let line = `  [${time}] ${entry.event.toUpperCase()} ${entry.handoffId}`;

        if (entry.from && entry.to) {
          line += ` ${entry.from} -> ${entry.to}`;
        }

        if (entry.reason) {
          line += ` (${entry.reason})`;
        }

        console.log(line);
      }

      console.log("");
    } catch (error) {
      console.error(
        `Failed to read ledger: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: "--handoff <id>",
    description: "Filter entries by handoff ID",
  })
  parseHandoff(val: string): string {
    return val;
  }
}
