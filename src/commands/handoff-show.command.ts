import { SubCommand, CommandRunner } from "nest-commander";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HandoffMeta } from "../handoff/handoff.types.js";

const HANDOFFS_DIR = ".virgil/handoffs";

@SubCommand({
  name: "show",
  arguments: "<handoff-id>",
  description: "Show handoff details",
})
export class HandoffShowCommand extends CommandRunner {
  async run(args: string[]): Promise<void> {
    const handoffId = args[0];
    if (!handoffId) {
      console.error("Usage: virgil handoff show <handoff-id>");
      return;
    }

    const metaPath = resolve(process.cwd(), HANDOFFS_DIR, handoffId, "META.json");

    try {
      const raw = await readFile(metaPath, "utf-8");
      const meta: HandoffMeta = JSON.parse(raw);

      console.log(`\nHandoff: ${meta.id}`);
      console.log("=".repeat(40));
      console.log(`  Schema:    ${meta.schemaVersion}`);
      console.log(`  State:     ${meta.state}`);
      console.log(`  Ticket:    ${meta.ticketKey}`);
      console.log(`  FF Level:  ${meta.ffLevel}`);
      console.log(`  Generated: ${meta.generatedAt}`);

      if (meta.repos.length > 0) {
        console.log(`\n  Repos:`);
        for (const repo of meta.repos) {
          console.log(`    - ${repo.repoPath}`);
          console.log(`      Branch: ${repo.branch}`);
          console.log(`      Commit: ${repo.commitSha}`);
        }
      }

      console.log(`\n  Guardrails:`);
      console.log(`    Allowed:     ${meta.guardrails.allowedPaths.join(", ")}`);
      console.log(`    Forbidden:   ${meta.guardrails.forbiddenPaths.join(", ")}`);
      console.log(`    Max files:   ${meta.guardrails.maxFilesChanged}`);
      console.log(`    Max lines:   ${meta.guardrails.maxLinesChanged}`);
      console.log("");
    } catch (error) {
      console.error(
        `Failed to read handoff: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
