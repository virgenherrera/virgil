import { SubCommand, CommandRunner } from "nest-commander";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { HandoffMeta } from "../handoff/handoff.types.js";

const HANDOFFS_DIR = ".virgil/handoffs";

@SubCommand({
  name: "list",
  description: "List all handoffs",
})
export class HandoffListCommand extends CommandRunner {
  async run(): Promise<void> {
    const handoffsPath = resolve(process.cwd(), HANDOFFS_DIR);

    let entries: string[];
    try {
      entries = await readdir(handoffsPath);
    } catch {
      console.log("No handoffs found.");
      return;
    }

    if (entries.length === 0) {
      console.log("No handoffs found.");
      return;
    }

    console.log("\nHandoffs:\n");

    for (const entry of entries) {
      const metaPath = resolve(handoffsPath, entry, "META.json");
      try {
        const raw = await readFile(metaPath, "utf-8");
        const meta: HandoffMeta = JSON.parse(raw);
        console.log(
          `  ${meta.id}  [${meta.state}]  ticket: ${meta.ticketKey}  ff: ${meta.ffLevel}`,
        );
      } catch {
        console.log(`  ${entry}  [unknown - META.json unreadable]`);
      }
    }

    console.log("");
  }
}
