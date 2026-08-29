import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";

@Command({
  name: "doctor",
  description: "Check system health and configuration",
})
export class DoctorCommand extends CommandRunner {
  constructor(
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    super();
  }

  async run(): Promise<void> {
    console.log(`Node.js: ${process.version}`);

    const configExists = existsSync(join(process.cwd(), ".virgilrc.yaml"));
    console.log(
      `Config: ${configExists ? ".virgilrc.yaml found" : 'No config file (run "virgil init")'}`,
    );

    const capabilities = this.capabilityRegistry.list();

    if (capabilities.length === 0) {
      console.log("\nNo providers configured.");
      console.log('Run "virgil init" to create a config template.');
      return;
    }

    console.log(`\nProviders (${capabilities.length}):`);
    for (const cap of capabilities) {
      const icon =
        cap.status === "available"
          ? "OK"
          : cap.status === "degraded"
            ? "WARN"
            : "FAIL";
      console.log(
        `  [${icon}] ${cap.id}: ${cap.description ?? cap.status}`,
      );
    }

    console.log("\nVerification tools:");
    const tools: readonly [string, string][] = [
      ["vitest", "npx vitest --version"],
      ["tsc", "npx tsc --version"],
      ["eslint", "npx eslint --version"],
    ];

    for (const [name, cmd] of tools) {
      try {
        execSync(cmd, { stdio: "pipe", timeout: 10000 });
        console.log(`  [OK] ${name}`);
      } catch {
        console.log(`  [--] ${name} (not available)`);
      }
    }
  }
}
