import { Inject } from "@nestjs/common";
import { SubCommand, CommandRunner, Option } from "nest-commander";
import { HandoffService } from "../handoff/handoff.service.js";
import type { HandoffOptions } from "../handoff/handoff.types.js";

interface HandoffCreateOptions {
  ff?: number;
  repo?: string;
  allowed?: string;
  forbidden?: string;
  maxFiles?: number;
  maxLines?: number;
}

@SubCommand({
  name: "create",
  arguments: "<ticket-key>",
  description: "Create a new handoff for a ticket",
})
export class HandoffCreateCommand extends CommandRunner {
  constructor(
    @Inject(HandoffService)
    private readonly handoffService: HandoffService,
  ) {
    super();
  }

  async run(args: string[], options?: HandoffCreateOptions): Promise<void> {
    const ticketKey = args[0];
    if (!ticketKey) {
      console.error("Usage: virgil handoff create <ticket-key>");
      return;
    }

    const handoffOptions: HandoffOptions = {
      ...(options?.ff != null && { ffLevel: options.ff as 1 | 2 | 3 | 4 }),
      ...(options?.repo != null && { repoPath: options.repo }),
      ...(options?.allowed != null && { allowedPaths: options.allowed.split(",") }),
      ...(options?.forbidden != null && { forbiddenPaths: options.forbidden.split(",") }),
      ...(options?.maxFiles != null && { maxFilesChanged: options.maxFiles }),
      ...(options?.maxLines != null && { maxLinesChanged: options.maxLines }),
    };

    try {
      const meta = await this.handoffService.create(ticketKey, handoffOptions);

      console.log(`\nHandoff created successfully`);
      console.log(`  ID:        ${meta.id}`);
      console.log(`  Directory: .virgil/handoffs/${meta.id}/`);
      console.log(`  State:     ${meta.state}`);
      console.log(`  FF Level:  ${meta.ffLevel}`);
      console.log(`\n  Files:`);
      console.log(`    - TASK.md`);
      console.log(`    - CONTEXT.md`);
      console.log(`    - ACCEPTANCE_CHECKLIST.md`);
      console.log(`    - META.json`);
    } catch (error) {
      console.error(
        `Failed to create handoff: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: "--ff <level>",
    description: "FastForward level (1-4)",
  })
  parseFf(val: string): number {
    const level = parseInt(val, 10);
    if (level < 1 || level > 4) {
      throw new Error("FF level must be between 1 and 4");
    }
    return level;
  }

  @Option({
    flags: "--repo <path>",
    description: "Repository path",
  })
  parseRepo(val: string): string {
    return val;
  }

  @Option({
    flags: "--allowed <globs>",
    description: "Comma-separated list of allowed path globs",
  })
  parseAllowed(val: string): string {
    return val;
  }

  @Option({
    flags: "--forbidden <globs>",
    description: "Comma-separated list of forbidden path globs",
  })
  parseForbidden(val: string): string {
    return val;
  }

  @Option({
    flags: "--max-files <n>",
    description: "Maximum number of files that can be changed",
  })
  parseMaxFiles(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: "--max-lines <n>",
    description: "Maximum number of lines that can be changed",
  })
  parseMaxLines(val: string): number {
    return parseInt(val, 10);
  }
}
