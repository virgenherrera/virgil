import { Injectable } from "@nestjs/common";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const LEDGER_PATH = ".virgil/ledger.jsonl";

export interface LedgerEntry {
  readonly timestamp: string;
  readonly handoffId: string;
  readonly event: "transition" | "audit" | "break-glass" | "created" | "phase-transition";
  readonly from?: string;
  readonly to?: string;
  readonly actor: string;
  readonly reason?: string;
  readonly data?: Record<string, unknown>;
}

@Injectable()
export class LedgerService {
  private getLedgerPath(): string {
    return resolve(process.cwd(), LEDGER_PATH);
  }

  async append(entry: LedgerEntry): Promise<void> {
    const filePath = this.getLedgerPath();
    const dir = dirname(filePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(entry) + "\n";
    appendFileSync(filePath, line, "utf-8");
  }

  async getEntries(handoffId?: string): Promise<LedgerEntry[]> {
    const filePath = this.getLedgerPath();

    if (!existsSync(filePath)) {
      return [];
    }

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    const entries: LedgerEntry[] = lines.map(
      (line) => JSON.parse(line) as LedgerEntry,
    );

    if (handoffId) {
      return entries.filter((e) => e.handoffId === handoffId);
    }

    return entries;
  }
}
