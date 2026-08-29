import { Inject, Injectable } from "@nestjs/common";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LedgerService } from "../ledger/ledger.service.js";
import type { HandoffMeta } from "./handoff.types.js";
import {
  VALID_PHASE_TRANSITIONS,
  type ExecutionPhase,
} from "./execution-tracker.types.js";

const HANDOFFS_DIR = ".virgil/handoffs";

@Injectable()
export class ExecutionTrackerService {
  constructor(
    @Inject(LedgerService)
    private readonly ledger: LedgerService,
  ) {}

  async advancePhase(
    handoffId: string,
    targetPhase: ExecutionPhase,
    repoPath?: string,
  ): Promise<HandoffMeta & { executionPhase: ExecutionPhase }> {
    const basePath = repoPath ?? process.cwd();
    const handoffDir = resolve(basePath, HANDOFFS_DIR, handoffId);
    const metaPath = resolve(handoffDir, "META.json");

    const raw = readFileSync(metaPath, "utf-8");
    const meta: HandoffMeta & { executionPhase?: ExecutionPhase } =
      JSON.parse(raw);

    // Only valid in execution state
    if (meta.state !== "execution") {
      throw new Error(
        `Execution phases only apply in 'execution' state, current state: ${meta.state}`,
      );
    }

    const currentPhase = meta.executionPhase ?? "pre-phase";
    const allowed = VALID_PHASE_TRANSITIONS[currentPhase];
    if (!allowed.includes(targetPhase)) {
      throw new Error(
        `Invalid phase transition: ${currentPhase} → ${targetPhase}. Valid targets: ${allowed.join(", ")}`,
      );
    }

    const updated = { ...meta, executionPhase: targetPhase };
    writeFileSync(metaPath, JSON.stringify(updated, null, 2), "utf-8");

    await this.ledger.append({
      timestamp: new Date().toISOString(),
      handoffId,
      event: "phase-transition",
      from: currentPhase,
      to: targetPhase,
      actor: "virgil-cli",
    });

    return updated;
  }

  currentPhase(handoffId: string, repoPath?: string): ExecutionPhase {
    const basePath = repoPath ?? process.cwd();
    const handoffDir = resolve(basePath, HANDOFFS_DIR, handoffId);
    const metaPath = resolve(handoffDir, "META.json");
    const raw = readFileSync(metaPath, "utf-8");
    const meta = JSON.parse(raw) as HandoffMeta & {
      executionPhase?: ExecutionPhase;
    };
    return meta.executionPhase ?? "pre-phase";
  }
}
