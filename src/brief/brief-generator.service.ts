import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import type { SnapshotProviderPort } from "../ports/context-provider.port.js";
import { buildRef } from "../domain/refs.js";
import { AppError, ERROR_CODE } from "../shared/errors.js";
import { extractSections } from "./section-extractor.js";
import { classifySection } from "./classifiers/regex-classifier.js";
import { summarizeSection } from "./summarizers/privacy-aware-summarizer.js";
import type { Brief, BriefItem, BriefKind, BriefStats } from "./brief.types.js";
import type { DogmaDocument } from "../providers/dogma/dogma.types.js";

const KIND_SORT_ORDER: readonly BriefKind[] = [
  "risk",
  "constraint",
  "decision",
  "glossary",
  "open-question",
  "principle",
];

@Injectable()
export class BriefGeneratorService {
  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async generate(outputDir: string): Promise<Brief> {
    const dogmaProviders = this.providerRegistry.getByKind("dogma");

    if (dogmaProviders.length === 0) {
      throw new AppError(
        "No dogma provider registered. Configure VIRGIL_DOGMA_LOCAL_PATH to activate the local dogma provider.",
        ERROR_CODE.NO_DOGMA_PROVIDER,
      );
    }

    const startTime = Date.now();
    const items: BriefItem[] = [];
    let totalDocuments = 0;

    for (const provider of dogmaProviders) {
      const snapshotProvider = provider as unknown as SnapshotProviderPort<DogmaDocument[]>;
      const snapshot = await snapshotProvider.snapshot({});

      for (const doc of snapshot.data) {
        totalDocuments++;
        const sourceRef = buildRef("dogma", provider.backendId, doc.relativePath);
        const sections = extractSections(doc.content);

        for (const section of sections) {
          const kind = classifySection(section.title, section.body);
          const summary = summarizeSection(section.body);
          const hashInput = `${sourceRef}:${section.title}:${section.index}`;
          const id =
            "brief-" +
            createHash("sha256").update(hashInput).digest("hex").slice(0, 12);

          items.push({
            id,
            kind,
            title: section.title,
            summary,
            sourceRefs: [sourceRef],
          });
        }
      }
    }

    const watermark = getGitWatermark(outputDir);
    const durationMs = Date.now() - startTime;

    const byKind: Record<BriefKind, number> = {
      principle: 0,
      constraint: 0,
      risk: 0,
      decision: 0,
      glossary: 0,
      "open-question": 0,
    };

    for (const item of items) {
      byKind[item.kind]++;
    }

    const stats: BriefStats = {
      totalDocuments,
      totalItems: items.length,
      byKind,
      durationMs,
    };

    const sortedItems = [...items].sort(
      (a, b) => KIND_SORT_ORDER.indexOf(a.kind) - KIND_SORT_ORDER.indexOf(b.kind),
    );

    const brief: Brief = {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      watermark,
      items: sortedItems,
      stats,
    };

    persist(outputDir, brief);

    return brief;
  }
}

function getGitWatermark(cwd: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd, stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function persist(outputDir: string, brief: Brief): void {
  const virgilDir = join(outputDir, ".virgil");
  mkdirSync(virgilDir, { recursive: true });

  writeFileSync(
    join(virgilDir, "brief.json"),
    JSON.stringify(brief, null, 2),
    "utf-8",
  );

  writeFileSync(join(virgilDir, "brief.md"), renderMarkdown(brief), "utf-8");
}

function renderMarkdown(brief: Brief): string {
  const lines: string[] = [
    "# Dogma Brief",
    "",
    `Generated: ${brief.generatedAt}`,
    `Watermark: ${brief.watermark}`,
    `Documents: ${brief.stats.totalDocuments} | Items: ${brief.stats.totalItems}`,
    "",
    "## Items",
    "",
  ];

  for (const item of brief.items) {
    lines.push(`### ${item.title}`);
    lines.push("");
    lines.push(`- **Kind**: ${item.kind}`);
    lines.push(`- **Source**: ${item.sourceRefs.join(", ")}`);
    lines.push("");
    lines.push(item.summary);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
