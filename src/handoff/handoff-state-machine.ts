import { Inject, Injectable } from "@nestjs/common";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { LedgerService } from "../ledger/ledger.service.js";
import type { HandoffMeta, HandoffState, AuditResult } from "./handoff.types.js";

const HANDOFFS_DIR = ".virgil/handoffs";
const BREAK_GLASS_HOURS = 72;

export interface TransitionCheck {
  readonly allowed: boolean;
  readonly reason: string;
}

export type TransitionPrecondition = (
  handoffDir: string,
  meta: HandoffMeta,
) => Promise<TransitionCheck>;

export const VALID_TRANSITIONS: Record<HandoffState, readonly HandoffState[]> = {
  draft: ["handoff"],
  handoff: ["execution"],
  execution: ["verify"],
  verify: ["delivered", "execution"],
  delivered: [],
};

function checkFilesExist(
  handoffDir: string,
  files: readonly string[],
): TransitionCheck {
  const missing: string[] = [];
  for (const file of files) {
    if (!existsSync(resolve(handoffDir, file))) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `Missing required files: ${missing.join(", ")}`,
    };
  }

  return { allowed: true, reason: "All required files present" };
}

const PRECONDITIONS: Partial<
  Record<HandoffState, Partial<Record<HandoffState, TransitionPrecondition>>>
> = {
  draft: {
    handoff: async (handoffDir) =>
      checkFilesExist(handoffDir, [
        "TASK.md",
        "CONTEXT.md",
        "ACCEPTANCE_CHECKLIST.md",
        "META.json",
      ]),
  },
  execution: {
    verify: async (handoffDir) =>
      checkFilesExist(handoffDir, ["AGENT_OUTPUT.md"]),
  },
  verify: {
    delivered: async (handoffDir) => {
      const reportPath = resolve(handoffDir, "AUDIT_REPORT.json");
      if (!existsSync(reportPath)) {
        return {
          allowed: false,
          reason: "AUDIT_REPORT.json not found — run audit first",
        };
      }

      const raw = readFileSync(reportPath, "utf-8");
      const report: AuditResult = JSON.parse(raw);

      if (report.verdict !== "PASS") {
        return {
          allowed: false,
          reason: `Audit verdict is ${report.verdict}, must be PASS to deliver`,
        };
      }

      return { allowed: true, reason: "Audit passed" };
    },
    execution: async (handoffDir) => {
      const reportPath = resolve(handoffDir, "AUDIT_REPORT.json");
      if (!existsSync(reportPath)) {
        return {
          allowed: false,
          reason: "AUDIT_REPORT.json not found — run audit first",
        };
      }

      const raw = readFileSync(reportPath, "utf-8");
      const report: AuditResult = JSON.parse(raw);

      if (report.verdict === "PASS") {
        return {
          allowed: false,
          reason:
            "Audit verdict is PASS — use transition to delivered instead",
        };
      }

      return {
        allowed: true,
        reason: `Audit verdict is ${report.verdict} — re-delegation allowed`,
      };
    },
  },
};

@Injectable()
export class HandoffStateMachine {
  constructor(
    @Inject(LedgerService)
    private readonly ledger: LedgerService,
  ) {}

  async transition(
    handoffId: string,
    targetState: HandoffState,
    options?: { breakGlass?: boolean; reason?: string },
  ): Promise<HandoffMeta> {
    const handoffDir = resolve(process.cwd(), HANDOFFS_DIR, handoffId);
    const metaPath = resolve(handoffDir, "META.json");

    // 1. Read META.json
    const raw = readFileSync(metaPath, "utf-8");
    const meta: HandoffMeta = JSON.parse(raw);

    // 2. Validate transition is in VALID_TRANSITIONS
    const allowed = VALID_TRANSITIONS[meta.state];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `Invalid transition: ${meta.state} -> ${targetState}. Valid targets: ${allowed.length > 0 ? allowed.join(", ") : "(none — terminal state)"}`,
      );
    }

    const breakGlass = options?.breakGlass ?? false;
    const reason = options?.reason;

    // 3/4. Precondition check (skip if break-glass)
    if (!breakGlass) {
      const preconditionFn = PRECONDITIONS[meta.state]?.[targetState];
      if (preconditionFn) {
        const check = await preconditionFn(handoffDir, meta);
        if (!check.allowed) {
          throw new Error(
            `Precondition failed for ${meta.state} -> ${targetState}: ${check.reason}`,
          );
        }
      }
    }

    // 5. Update state in META.json
    const now = new Date();
    const updatedMeta: HandoffMeta = {
      ...meta,
      state: targetState,
      ...(breakGlass
        ? {
            breakGlass: {
              activatedAt: now.toISOString(),
              reason: reason ?? "No reason provided",
              certificationDeadline: new Date(
                now.getTime() + BREAK_GLASS_HOURS * 60 * 60 * 1000,
              ).toISOString(),
            },
          }
        : {}),
    };

    writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2), "utf-8");

    // 6. Write ledger entries
    if (breakGlass) {
      await this.ledger.append({
        timestamp: now.toISOString(),
        handoffId,
        event: "break-glass",
        from: meta.state,
        to: targetState,
        actor: "virgil-cli",
        reason: reason ?? "No reason provided",
      });
    }

    await this.ledger.append({
      timestamp: now.toISOString(),
      handoffId,
      event: "transition",
      from: meta.state,
      to: targetState,
      actor: "virgil-cli",
      reason,
    });

    // 7. Return updated meta
    return updatedMeta;
  }
}
