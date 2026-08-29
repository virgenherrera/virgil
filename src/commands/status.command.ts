import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";

@Command({
  name: "status",
  description: "Display registered capabilities and their current status",
})
export class StatusCommand extends CommandRunner {
  constructor(
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const capabilities = this.capabilityRegistry.list();
    const providers = this.providerRegistry.getAll();

    console.log("Virgil CLI v0.1.0");
    console.log("=================\n");

    if (providers.length === 0) {
      console.log("No providers registered.");
      console.log(
        "Configure provider env vars to activate adapters.",
      );
      return;
    }

    console.log("Providers:\n");

    const healthMap = await this.providerRegistry.healthCheckAll();

    for (const provider of providers) {
      const health = healthMap.get(provider.capabilityId);
      const statusIcon =
        health?.status === "available"
          ? "[OK]"
          : health?.status === "degraded"
            ? "[!!]"
            : "[--]";
      const message = health?.message ? ` - ${health.message}` : "";

      console.log(
        `  ${statusIcon} ${provider.capabilityId} (kind: ${provider.kind}, backend: ${provider.backendId})${message}`,
      );
    }

    if (capabilities.length > 0) {
      console.log("\nCapabilities:\n");
      for (const cap of capabilities) {
        const icon =
          cap.status === "available"
            ? "[OK]"
            : cap.status === "degraded"
              ? "[!!]"
              : "[??]";
        console.log(
          `  ${icon} ${cap.id} - ${cap.description} (${cap.status})`,
        );
        if (cap.refs && cap.refs.length > 0) {
          for (const ref of cap.refs) {
            console.log(`      -> ${ref}`);
          }
        }
      }
    }
  }
}
