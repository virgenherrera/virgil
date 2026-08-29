import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { AuditService } from "../audit/audit.service.js";

@Command({
  name: "audit",
  arguments: "<handoff-id>",
  description: "Audit a handoff against its baseline",
})
export class AuditCommand extends CommandRunner {
  constructor(
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async run(args: string[]): Promise<void> {
    const handoffId = args[0];
    if (!handoffId) {
      console.error("Usage: virgil audit <handoff-id>");
      return;
    }

    try {
      const result = await this.auditService.audit(handoffId);

      const verdictLabel =
        result.verdict === "PASS"
          ? "[PASS]"
          : result.verdict === "WARN"
            ? "[WARN]"
            : "[FAIL]";

      console.log(`\nAudit: ${result.handoffId}`);
      console.log("=".repeat(40));
      console.log(`  Verdict: ${verdictLabel}`);
      console.log(`  Audited: ${result.auditedAt}`);
      console.log(`\n  Checks:`);

      for (const check of result.checks) {
        const icon = check.passed ? "PASS" : "FAIL";
        console.log(`    [${icon}] ${check.name}: ${check.message}`);
      }

      console.log("");
    } catch (error) {
      console.error(
        `Failed to audit handoff: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
