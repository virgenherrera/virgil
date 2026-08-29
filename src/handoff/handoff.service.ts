import { Inject, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { buildRef } from "../domain/refs.js";
import type {
  SnapshotProviderPort,
  SnapshotScope,
} from "../ports/context-provider.port.js";
import type { DogmaDocument } from "../providers/dogma/dogma.types.js";
import type {
  HandoffMeta,
  HandoffOptions,
  RepoBaseline,
  Guardrails,
} from "./handoff.types.js";
import { HANDOFF_STATE } from "./handoff.types.js";

const SCHEMA_VERSION = "1.0.0";
const HANDOFFS_DIR = ".virgil/handoffs";

const FF_LABELS: Record<number, string> = {
  1: "Full ceremony",
  2: "Reduced",
  3: "Minimal",
  4: "Direct execution",
};

const DEFAULT_OPTIONS: Required<HandoffOptions> = {
  ffLevel: 1,
  repoPath: process.cwd(),
  allowedPaths: ["src/**"],
  forbiddenPaths: ["*.env", "*.key", "*.secret"],
  maxFilesChanged: 8,
  maxLinesChanged: 400,
};

@Injectable()
export class HandoffService {
  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
    @Inject(LedgerService)
    private readonly ledger: LedgerService,
  ) {}

  async create(
    ticketKey: string,
    options: HandoffOptions = {},
  ): Promise<HandoffMeta> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const id = `${ticketKey}-${Date.now()}`;
    const handoffDir = resolve(opts.repoPath, HANDOFFS_DIR, id);

    await mkdir(handoffDir, { recursive: true });

    const ticketSummary = await this.resolveTicket(ticketKey);
    const dogmaDocs = await this.snapshotDogma();
    const repoBaseline = this.detectRepoBaseline(opts.repoPath);

    const guardrails: Guardrails = {
      allowedPaths: opts.allowedPaths,
      forbiddenPaths: opts.forbiddenPaths,
      maxFilesChanged: opts.maxFilesChanged,
      maxLinesChanged: opts.maxLinesChanged,
    };

    const now = new Date().toISOString();

    await this.writeTask(handoffDir, ticketKey, ticketSummary, guardrails, opts.ffLevel);
    await this.writeContext(handoffDir, ticketKey, ticketSummary, dogmaDocs, repoBaseline, now);
    await this.writeChecklist(handoffDir, guardrails);

    const meta: HandoffMeta = {
      id,
      schemaVersion: SCHEMA_VERSION,
      state: HANDOFF_STATE.DRAFT,
      ticketKey,
      ffLevel: opts.ffLevel,
      generatedAt: now,
      repos: repoBaseline ? [repoBaseline] : [],
      guardrails,
    };

    await writeFile(
      resolve(handoffDir, "META.json"),
      JSON.stringify(meta, null, 2),
      "utf-8",
    );

    await this.ledger.append({
      timestamp: now,
      handoffId: id,
      event: "created",
      actor: "virgil-cli",
      data: { ticketKey, ffLevel: opts.ffLevel },
    });

    return meta;
  }

  private async resolveTicket(ticketKey: string): Promise<string | null> {
    const ticketProviders = this.providerRegistry.getByKind("ticket");

    for (const provider of ticketProviders) {
      const ref = buildRef("ticket", provider.backendId, ticketKey);
      try {
        const resolution = await provider.resolveRef(ref);
        if (resolution.resolved && resolution.label) {
          return resolution.label;
        }
      } catch {
        // continue to next provider
      }
    }

    return null;
  }

  private async snapshotDogma(): Promise<DogmaDocument[]> {
    const dogmaProviders = this.providerRegistry.getByKind("dogma");

    for (const provider of dogmaProviders) {
      const snapshotProvider = provider as SnapshotProviderPort<DogmaDocument[]>;
      if (!("snapshot" in snapshotProvider)) {
        continue;
      }

      try {
        const scope: SnapshotScope = { maxItems: 50 };
        const result = await snapshotProvider.snapshot(scope);
        return result.data;
      } catch {
        // continue to next provider
      }
    }

    return [];
  }

  private detectRepoBaseline(repoPath: string): RepoBaseline | null {
    try {
      const toplevel = execSync("git rev-parse --show-toplevel", {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      const commitSha = execSync("git rev-parse HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      return { repoPath: toplevel, branch, commitSha };
    } catch {
      return null;
    }
  }

  private async writeTask(
    dir: string,
    ticketKey: string,
    summary: string | null,
    guardrails: Guardrails,
    ffLevel: 1 | 2 | 3 | 4,
  ): Promise<void> {
    const objective = summary ?? "Manual task -- no ticket provider configured";
    const content = `# Task: ${ticketKey}

## Objective
${objective}

## Scope
- Allowed paths: ${guardrails.allowedPaths.join(", ")}
- Forbidden paths: ${guardrails.forbiddenPaths.join(", ")}
- Max files: ${guardrails.maxFilesChanged}
- Max lines: ${guardrails.maxLinesChanged}

## Instructions
1. Read CONTEXT.md for full background
2. Follow ACCEPTANCE_CHECKLIST.md for completion criteria
3. Stay within the guardrails defined in this task
4. Write AGENT_OUTPUT.md when done with a summary of changes

## FastForward Level: ${ffLevel}
${FF_LABELS[ffLevel]}
`;

    await writeFile(resolve(dir, "TASK.md"), content, "utf-8");
  }

  private async writeContext(
    dir: string,
    ticketKey: string,
    ticketSummary: string | null,
    dogmaDocs: DogmaDocument[],
    baseline: RepoBaseline | null,
    timestamp: string,
  ): Promise<void> {
    let content = `# Context for ${ticketKey}

Generated: ${timestamp}

## Ticket
`;

    if (ticketSummary) {
      content += `${ticketSummary}\n`;
    } else {
      content += `No ticket provider configured.\n`;
    }

    content += `\n## Documentation\n`;

    if (dogmaDocs.length > 0) {
      for (const doc of dogmaDocs) {
        const excerpt = doc.content.slice(0, 200).replace(/\n/g, " ");
        content += `- **${doc.ref}**: ${excerpt}\n`;
      }
    } else {
      content += `No dogma documents available.\n`;
    }

    content += `\n## Repository\n`;

    if (baseline) {
      content += `- Path: ${baseline.repoPath}\n`;
      content += `- Branch: ${baseline.branch}\n`;
      content += `- Commit: ${baseline.commitSha}\n`;
    } else {
      content += `Not a git repository.\n`;
    }

    await writeFile(resolve(dir, "CONTEXT.md"), content, "utf-8");
  }

  private async writeChecklist(
    dir: string,
    guardrails: Guardrails,
  ): Promise<void> {
    const content = `# Acceptance Checklist

- [ ] Implementation matches ticket requirements
- [ ] Changes stay within allowed paths
- [ ] No changes to forbidden paths
- [ ] File count within limit (${guardrails.maxFilesChanged})
- [ ] Line count within limit (${guardrails.maxLinesChanged})
- [ ] No conflict markers in changed files
- [ ] AGENT_OUTPUT.md written with change summary
`;

    await writeFile(resolve(dir, "ACCEPTANCE_CHECKLIST.md"), content, "utf-8");
  }
}
