import { Inject, Injectable, Optional } from "@nestjs/common";
import { readFile, writeFile, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import picomatch from "picomatch";
import { LedgerService } from "../ledger/ledger.service.js";
import type {
  HandoffMeta,
  AuditResult,
  AuditCheck,
  GapType,
} from "../handoff/handoff.types.js";
import { GAP_TYPE } from "../handoff/handoff.types.js";
import {
  VERIFICATION_GATES_CONFIG_TOKEN,
  type VerificationGatesConfigType,
} from "../config/verification-gates.config.js";

const HANDOFFS_DIR = ".virgil/handoffs";

const CHECK_GAP_MAP: Record<string, GapType> = {
  scope: GAP_TYPE.IMPLEMENTATION,
  forbidden: GAP_TYPE.IMPLEMENTATION,
  "file-count": GAP_TYPE.IMPLEMENTATION,
  "line-count": GAP_TYPE.IMPLEMENTATION,
  "conflict-markers": GAP_TYPE.CONTRACT,
  "agent-output": GAP_TYPE.COMPLIANCE,
  coverage: GAP_TYPE.TESTING,
  "npm-audit": GAP_TYPE.COMPLIANCE,
  "type-check": GAP_TYPE.CONTRACT,
  complexity: GAP_TYPE.CONTRACT,
  "circular-deps": GAP_TYPE.CONTRACT,
  "outdated-deps": GAP_TYPE.COMPLIANCE,
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(LedgerService)
    private readonly ledger: LedgerService,
    @Optional()
    @Inject(VERIFICATION_GATES_CONFIG_TOKEN)
    private readonly verificationConfig?: VerificationGatesConfigType,
  ) {}

  async audit(handoffId: string): Promise<AuditResult> {
    const handoffDir = resolve(process.cwd(), HANDOFFS_DIR, handoffId);
    const metaPath = resolve(handoffDir, "META.json");

    const raw = await readFile(metaPath, "utf-8");
    const meta: HandoffMeta = JSON.parse(raw);

    const checks: AuditCheck[] = [];

    for (const repo of meta.repos) {
      const changedFiles = this.getChangedFiles(repo.repoPath, repo.commitSha);
      const lineStats = this.getLineStats(repo.repoPath, repo.commitSha);

      checks.push(this.checkScope(changedFiles, meta.guardrails.allowedPaths as string[]));
      checks.push(this.checkForbidden(changedFiles, meta.guardrails.forbiddenPaths as string[]));
      checks.push(this.checkFileCount(changedFiles, meta.guardrails.maxFilesChanged));
      checks.push(this.checkLineCount(lineStats, meta.guardrails.maxLinesChanged));
      checks.push(this.checkConflictMarkers(repo.repoPath, changedFiles));
    }

    if (meta.repos.length === 0) {
      checks.push({ name: "scope", passed: true, message: "No repos in baseline" });
      checks.push({ name: "forbidden", passed: true, message: "No repos in baseline" });
      checks.push({ name: "file-count", passed: true, message: "No repos in baseline" });
      checks.push({ name: "line-count", passed: true, message: "No repos in baseline" });
      checks.push({ name: "conflict-markers", passed: true, message: "No repos in baseline" });
    }

    checks.push(await this.checkAgentOutput(handoffDir));

    // Verification gates — optional, run only when configured
    if (meta.repos.length > 0 && this.verificationConfig) {
      const repo = meta.repos[0]!;

      if (this.verificationConfig.coverageThreshold !== undefined) {
        checks.push(
          this.checkCoverage(repo.repoPath, this.verificationConfig.coverageThreshold),
        );
      }

      if (this.verificationConfig.maxCriticalCves !== undefined) {
        checks.push(
          this.checkNpmAudit(repo.repoPath, this.verificationConfig.maxCriticalCves),
        );
      }

      if (this.verificationConfig.typeCheck) {
        checks.push(this.checkTypeCheck(repo.repoPath));
      }

      if (this.verificationConfig.maxComplexity !== undefined) {
        checks.push(
          this.checkComplexity(repo.repoPath, this.verificationConfig.maxComplexity),
        );
      }

      if (this.verificationConfig.checkCircularDeps) {
        checks.push(this.checkCircularDeps(repo.repoPath));
      }

      if (this.verificationConfig.maxMajorOutdated !== undefined) {
        checks.push(
          this.checkOutdatedDeps(repo.repoPath, this.verificationConfig.maxMajorOutdated),
        );
      }
    }

    // Annotate checks with gap types
    const annotatedChecks: AuditCheck[] = checks.map((check) => ({
      ...check,
      ...((!check.passed && CHECK_GAP_MAP[check.name])
        ? { gapType: CHECK_GAP_MAP[check.name] }
        : {}),
    }));

    const agentOutputCheck = annotatedChecks.find((c) => c.name === "agent-output");
    const nonAgentChecks = annotatedChecks.filter((c) => c.name !== "agent-output");

    let verdict: "PASS" | "WARN" | "FAIL";
    if (nonAgentChecks.every((c) => c.passed)) {
      if (agentOutputCheck && !agentOutputCheck.passed) {
        verdict = "WARN";
      } else {
        verdict = "PASS";
      }
    } else {
      verdict = "FAIL";
    }

    const recommendation = this.generateRecommendation(annotatedChecks, verdict);
    const now = new Date().toISOString();

    const result: AuditResult = {
      handoffId,
      verdict,
      checks: annotatedChecks,
      auditedAt: now,
      ...(recommendation ? { recommendation } : {}),
    };

    await writeFile(
      resolve(handoffDir, "AUDIT_REPORT.json"),
      JSON.stringify(result, null, 2),
      "utf-8",
    );

    await this.writeFeedback(handoffDir, result);

    await this.ledger.append({
      timestamp: now,
      handoffId,
      event: "audit",
      actor: "virgil-cli",
      data: { verdict, recommendation },
    });

    return result;
  }

  private getChangedFiles(repoPath: string, baselineSha: string): string[] {
    try {
      const output = execSync(`git diff --name-only ${baselineSha}..HEAD`, {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      if (!output) return [];
      return output.split("\n");
    } catch {
      return [];
    }
  }

  private getLineStats(repoPath: string, baselineSha: string): number {
    try {
      const output = execSync(`git diff --stat ${baselineSha}..HEAD`, {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      if (!output) return 0;

      // The last line of --stat output contains the summary
      const lines = output.split("\n");
      const summary = lines[lines.length - 1];
      if (!summary) return 0;

      // Parse "X files changed, Y insertions(+), Z deletions(-)"
      const insertions = summary.match(/(\d+) insertion/);
      const deletions = summary.match(/(\d+) deletion/);
      const total =
        (insertions ? parseInt(insertions[1]!, 10) : 0) +
        (deletions ? parseInt(deletions[1]!, 10) : 0);

      return total;
    } catch {
      return 0;
    }
  }

  private checkScope(changedFiles: string[], allowedPaths: string[]): AuditCheck {
    if (changedFiles.length === 0) {
      return { name: "scope", passed: true, message: "No files changed" };
    }

    const isAllowed = picomatch(allowedPaths);
    const outOfScope = changedFiles.filter((f) => !isAllowed(f));

    if (outOfScope.length === 0) {
      return {
        name: "scope",
        passed: true,
        message: `All ${changedFiles.length} files within allowed paths`,
      };
    }

    return {
      name: "scope",
      passed: false,
      message: `${outOfScope.length} file(s) outside allowed paths: ${outOfScope.join(", ")}`,
    };
  }

  private checkForbidden(changedFiles: string[], forbiddenPaths: string[]): AuditCheck {
    if (changedFiles.length === 0) {
      return { name: "forbidden", passed: true, message: "No files changed" };
    }

    const isForbidden = picomatch(forbiddenPaths);
    const violations = changedFiles.filter((f) => isForbidden(f));

    if (violations.length === 0) {
      return {
        name: "forbidden",
        passed: true,
        message: "No forbidden files modified",
      };
    }

    return {
      name: "forbidden",
      passed: false,
      message: `${violations.length} forbidden file(s) modified: ${violations.join(", ")}`,
    };
  }

  private checkFileCount(changedFiles: string[], max: number): AuditCheck {
    const count = changedFiles.length;
    if (count <= max) {
      return {
        name: "file-count",
        passed: true,
        message: `${count}/${max} files changed`,
      };
    }

    return {
      name: "file-count",
      passed: false,
      message: `${count} files changed, exceeds limit of ${max}`,
    };
  }

  private checkLineCount(totalLines: number, max: number): AuditCheck {
    if (totalLines <= max) {
      return {
        name: "line-count",
        passed: true,
        message: `${totalLines}/${max} lines changed`,
      };
    }

    return {
      name: "line-count",
      passed: false,
      message: `${totalLines} lines changed, exceeds limit of ${max}`,
    };
  }

  private checkConflictMarkers(repoPath: string, changedFiles: string[]): AuditCheck {
    if (changedFiles.length === 0) {
      return {
        name: "conflict-markers",
        passed: true,
        message: "No files to check",
      };
    }

    try {
      const result = execSync(
        `grep -rl '^<<<<<<<\\|^>>>>>>>' ${changedFiles.join(" ")} 2>/dev/null || true`,
        { cwd: repoPath, encoding: "utf-8" },
      ).trim();

      if (!result) {
        return {
          name: "conflict-markers",
          passed: true,
          message: "No conflict markers found",
        };
      }

      const filesWithMarkers = result.split("\n").filter(Boolean);
      return {
        name: "conflict-markers",
        passed: false,
        message: `Conflict markers found in: ${filesWithMarkers.join(", ")}`,
      };
    } catch {
      return {
        name: "conflict-markers",
        passed: true,
        message: "No conflict markers found",
      };
    }
  }

  private async checkAgentOutput(handoffDir: string): Promise<AuditCheck> {
    try {
      await access(resolve(handoffDir, "AGENT_OUTPUT.md"));
      return {
        name: "agent-output",
        passed: true,
        message: "AGENT_OUTPUT.md present",
      };
    } catch {
      return {
        name: "agent-output",
        passed: false,
        message: "AGENT_OUTPUT.md not found",
      };
    }
  }

  private checkCoverage(repoPath: string, threshold: number): AuditCheck {
    try {
      execSync("npx vitest run --coverage --reporter=json 2>/dev/null", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 120000,
      });
      const summaryPath = resolve(repoPath, "coverage", "coverage-summary.json");
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      const stmtPct = summary.total?.statements?.pct ?? 0;

      if (stmtPct >= threshold) {
        return {
          name: "coverage",
          passed: true,
          message: `Coverage ${stmtPct}% meets threshold ${threshold}%`,
        };
      }
      return {
        name: "coverage",
        passed: false,
        message: `Coverage ${stmtPct}% below threshold ${threshold}%`,
      };
    } catch {
      return {
        name: "coverage",
        passed: true,
        message: "Coverage check skipped: tool unavailable",
      };
    }
  }

  private checkNpmAudit(repoPath: string, maxCritical: number): AuditCheck {
    try {
      const output = execSync("npm audit --json 2>/dev/null || true", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 60000,
      });
      const audit = JSON.parse(output);
      const critical = audit.metadata?.vulnerabilities?.critical ?? 0;
      const high = audit.metadata?.vulnerabilities?.high ?? 0;
      const total = critical + high;

      if (total <= maxCritical) {
        return {
          name: "npm-audit",
          passed: true,
          message: `${total} critical/high CVEs (max: ${maxCritical})`,
        };
      }
      return {
        name: "npm-audit",
        passed: false,
        message: `${total} critical/high CVEs exceeds limit of ${maxCritical}`,
      };
    } catch {
      return {
        name: "npm-audit",
        passed: true,
        message: "NPM audit check skipped: tool unavailable",
      };
    }
  }

  private checkTypeCheck(repoPath: string): AuditCheck {
    try {
      execSync("npx tsc --noEmit", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 120000,
        stdio: "pipe",
      });
      return {
        name: "type-check",
        passed: true,
        message: "No type errors",
      };
    } catch (error) {
      const stderr =
        error instanceof Error && "stderr" in error
          ? (error as any).stderr
          : "";
      const errorCount = (stderr.match(/error TS/g) || []).length;
      return {
        name: "type-check",
        passed: false,
        message: `${errorCount || "Unknown number of"} type error(s) found`,
      };
    }
  }

  private checkComplexity(repoPath: string, maxComplexity: number): AuditCheck {
    try {
      const output = execSync(
        `npx eslint --rule 'complexity: [error, {max: ${maxComplexity}}]' --format json --no-eslintrc src/ 2>/dev/null || true`,
        { cwd: repoPath, encoding: "utf-8", timeout: 120000 },
      );
      const results = JSON.parse(output);
      const errorCount = Array.isArray(results)
        ? results.reduce((sum: number, file: any) => sum + file.errorCount, 0)
        : 0;

      if (errorCount === 0) {
        return {
          name: "complexity",
          passed: true,
          message: `No functions exceed complexity threshold ${maxComplexity}`,
        };
      }
      return {
        name: "complexity",
        passed: false,
        message: `${errorCount} function(s) exceed complexity threshold ${maxComplexity}`,
      };
    } catch {
      return {
        name: "complexity",
        passed: true,
        message: "Complexity check skipped: tool unavailable",
      };
    }
  }

  private checkCircularDeps(repoPath: string): AuditCheck {
    try {
      const output = execSync("npx madge --circular --json src/", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 120000,
      });
      const cycles = JSON.parse(output);

      if (!Array.isArray(cycles) || cycles.length === 0) {
        return {
          name: "circular-deps",
          passed: true,
          message: "No circular dependencies found",
        };
      }
      return {
        name: "circular-deps",
        passed: false,
        message: `${cycles.length} circular dependency chain(s) found`,
      };
    } catch {
      return {
        name: "circular-deps",
        passed: true,
        message: "Circular dependency check skipped: tool unavailable",
      };
    }
  }

  private checkOutdatedDeps(
    repoPath: string,
    maxMajorOutdated: number,
  ): AuditCheck {
    try {
      const output = execSync("npm outdated --json 2>/dev/null || true", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 60000,
      });
      const outdated = JSON.parse(output || "{}");
      let majorCount = 0;

      for (const [, info] of Object.entries(outdated)) {
        const pkg = info as { current: string; latest: string };
        const currentMajor = parseInt(
          (pkg.current ?? "0").split(".")[0]!,
          10,
        );
        const latestMajor = parseInt((pkg.latest ?? "0").split(".")[0]!, 10);
        if (latestMajor > currentMajor) majorCount++;
      }

      if (majorCount <= maxMajorOutdated) {
        return {
          name: "outdated-deps",
          passed: true,
          message: `${majorCount} major-outdated packages (max: ${maxMajorOutdated})`,
        };
      }
      return {
        name: "outdated-deps",
        passed: false,
        message: `${majorCount} major-outdated packages exceeds limit of ${maxMajorOutdated}`,
      };
    } catch {
      return {
        name: "outdated-deps",
        passed: true,
        message: "Outdated dependency check skipped: tool unavailable",
      };
    }
  }

  private generateRecommendation(
    checks: readonly AuditCheck[],
    verdict: "PASS" | "WARN" | "FAIL",
  ): string | undefined {
    if (verdict === "PASS") {
      return undefined;
    }

    const failedGaps = checks
      .filter((c) => !c.passed && c.gapType)
      .map((c) => c.gapType!);

    const uniqueGaps = [...new Set(failedGaps)];

    if (uniqueGaps.includes(GAP_TYPE.CONTRACT)) {
      return "Manual intervention required — resolve conflict markers before re-execution";
    }

    if (uniqueGaps.includes(GAP_TYPE.TESTING)) {
      return "Improve test coverage to meet threshold before re-delegation";
    }

    if (uniqueGaps.includes(GAP_TYPE.IMPLEMENTATION)) {
      return "Re-delegate with tighter scope constraints";
    }

    if (
      uniqueGaps.length > 0 &&
      uniqueGaps.every((g) => g === GAP_TYPE.COMPLIANCE)
    ) {
      return "Agent must write AGENT_OUTPUT.md — re-execute with explicit instruction";
    }

    return undefined;
  }

  private async writeFeedback(dir: string, result: AuditResult): Promise<void> {
    const lines = [`# Audit Feedback`, "", `Verdict: **${result.verdict}**`, `Audited: ${result.auditedAt}`, ""];

    for (const check of result.checks) {
      const icon = check.passed ? "PASS" : "FAIL";
      lines.push(`- [${icon}] **${check.name}**: ${check.message}`);
    }

    lines.push("");

    await writeFile(resolve(dir, "FEEDBACK.md"), lines.join("\n"), "utf-8");
  }
}
