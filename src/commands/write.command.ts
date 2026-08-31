import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option } from "nest-commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PlanningService } from "../planning/planning.service.js";
import { DOC_KIND, TASK_STATUS } from "../planning/planning.types.js";
import type { DocKind, TaskStatus } from "../planning/planning.types.js";

interface WriteOptions {
  kind?: DocKind;
  slug?: string;
  category?: string;
  status?: TaskStatus;
  content?: string;
  file?: string;
  req?: string[];
  design?: string[];
  implements?: string[];
}

@Command({
  name: "write",
  description: "Create or update a planning document (idea, requirement, design, or task)",
})
export class WriteCommand extends CommandRunner {
  constructor(
    @Inject(PlanningService)
    private readonly planningService: PlanningService,
  ) {
    super();
  }

  async run(_args: string[], options?: WriteOptions): Promise<void> {
    if (!options?.kind) {
      console.error(
        "Usage: virgil write --kind <idea|requirement|design|task> --slug <slug> --content <markdown>",
      );
      return;
    }

    if (options.kind !== DOC_KIND.IDEA && !options.slug) {
      console.error(`--slug is required for doc kind '${options.kind}'`);
      return;
    }

    let content: string;
    if (options.file) {
      try {
        content = readFileSync(resolve(process.cwd(), options.file), "utf-8");
      } catch (error) {
        console.error(
          `Failed to read file '${options.file}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    } else if (options.content != null) {
      content = options.content;
    } else {
      console.error("Either --content or --file is required");
      return;
    }

    try {
      const doc = this.planningService.write({
        kind: options.kind,
        slug: options.slug,
        category: options.category ?? null,
        content,
        status: options.status,
        refs: {
          requirements: options.req,
          design: options.design,
          implements: options.implements,
        },
      });

      console.log(`\nDocument written: ${doc.filePath}`);
      console.log(`  Kind:     ${doc.meta.doc_kind}`);
      console.log(`  Slug:     ${doc.meta.slug}`);
      if (doc.meta.category) {
        console.log(`  Category: ${doc.meta.category}`);
      }
      if (doc.meta.status) {
        console.log(`  Status:   ${doc.meta.status}`);
      }
      console.log(`  Digest:   ${doc.meta.content_digest}`);
      console.log(`  Updated:  ${doc.meta.updated_at}`);
    } catch (error) {
      console.error(
        `Failed to write document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: "--kind <kind>",
    description: "Document kind",
    choices: Object.values(DOC_KIND),
    required: true,
  })
  parseKind(val: string): DocKind {
    return val as DocKind;
  }

  @Option({
    flags: "--slug <slug>",
    description: "Document slug (required for non-idea kinds)",
  })
  parseSlug(val: string): string {
    return val;
  }

  @Option({
    flags: "--category <category>",
    description: "Optional category prefix (requirement/design only)",
  })
  parseCategory(val: string): string {
    return val;
  }

  @Option({
    flags: "--status <status>",
    description: "Task status (tasks only, default backlog)",
    choices: Object.values(TASK_STATUS),
  })
  parseStatus(val: string): TaskStatus {
    return val as TaskStatus;
  }

  @Option({
    flags: "--content <markdown>",
    description: "Markdown content of the document",
  })
  parseContent(val: string): string {
    return val;
  }

  @Option({
    flags: "--file <path>",
    description: "Read content from a file instead of --content",
  })
  parseFile(val: string): string {
    return val;
  }

  @Option({
    flags: "--req <slug>",
    description: "Requirement ref (repeatable)",
  })
  parseReq(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }

  @Option({
    flags: "--design <slug>",
    description: "Design ref (repeatable)",
  })
  parseDesign(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }

  @Option({
    flags: "--implements <path>",
    description: "Implementation source path ref (repeatable)",
  })
  parseImplements(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }
}
