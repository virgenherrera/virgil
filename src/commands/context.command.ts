import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { BriefQueryService } from "../brief/brief-query.service.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { AppError, ERROR_CODE } from "../shared/errors.js";
import { buildRef } from "../domain/refs.js";
import type {
  SnapshotProviderPort,
  SnapshotScope,
} from "../ports/context-provider.port.js";
import type { BriefItem, BriefKind } from "../brief/brief.types.js";
import type { OrgSnapshot } from "../providers/org/org.types.js";
import type { SourceCodeSnapshot } from "../providers/sourcecode/sourcecode.types.js";

@Command({
  name: "context",
  arguments: "<ticket-key>",
  description:
    "Show available context for a ticket: ticket detail, dogma documents, org, and source code",
})
export class ContextCommand extends CommandRunner {
  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
    @Inject(BriefQueryService)
    private readonly briefQuery: BriefQueryService,
    @Inject(BriefGeneratorService)
    private readonly briefGenerator: BriefGeneratorService,
  ) {
    super();
  }

  async run(args: string[]): Promise<void> {
    const ticketKey = args[0];
    if (!ticketKey) {
      console.error("Usage: virgil context <ticket-key>");
      return;
    }

    console.log(`\nContext for ${ticketKey}`);
    console.log("=".repeat(40));

    await this.showTicketContext(ticketKey);
    await this.showBriefContext();
    await this.showOrgContext();
    await this.showSourceCodeContext();
  }

  private async showTicketContext(ticketKey: string): Promise<void> {
    const ticketProviders = this.providerRegistry.getByKind("ticket");

    if (ticketProviders.length === 0) {
      console.log("\n[Ticket] No ticket providers configured");
      return;
    }

    console.log("\n[Ticket]");

    for (const provider of ticketProviders) {
      const ref = buildRef(
        "ticket",
        provider.backendId,
        ticketKey,
      );

      try {
        const resolution = await provider.resolveRef(ref);

        if (resolution.resolved) {
          console.log(
            `  Provider: ${provider.capabilityId}`,
          );
          console.log(`  Label:    ${resolution.label}`);
          console.log(`  URI:      ${resolution.uri}`);
        } else {
          console.log(
            `  ${provider.capabilityId}: Could not resolve ${ticketKey}`,
          );
        }
      } catch (error) {
        console.log(
          `  ${provider.capabilityId}: Error - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async showBriefContext(): Promise<void> {
    const cwd = process.cwd();

    let result;
    try {
      result = await this.briefQuery.query(cwd, {});
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === ERROR_CODE.BRIEF_NOT_FOUND
      ) {
        try {
          await this.briefGenerator.generate(cwd);
          result = await this.briefQuery.query(cwd, {});
        } catch {
          console.log(
            "\n[Dogma Brief] No dogma brief available. Run `virgil brief` to generate.",
          );
          return;
        }
      } else {
        console.log(
          `\n[Dogma Brief] Error - ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }

    console.log("\n[Dogma Brief]");

    if (result.drift.drifted) {
      console.log(
        `  Brief is ${result.drift.commitsBehind} commit(s) behind HEAD`,
      );
    }

    const grouped = new Map<BriefKind, readonly BriefItem[]>();
    for (const item of result.items) {
      const existing = grouped.get(item.kind) ?? [];
      grouped.set(item.kind, [...existing, item]);
    }

    for (const [kind, items] of grouped) {
      for (const item of items) {
        console.log(`  [${kind}] ${item.title}: ${item.summary}`);
      }
    }

    console.log(
      `  ${result.stats.matched} items from ${result.stats.total}`,
    );
  }

  private async showOrgContext(): Promise<void> {
    const orgProviders = this.providerRegistry.getByKind("org");

    if (orgProviders.length === 0) {
      console.log("\n[Org] No org providers configured");
      return;
    }

    console.log("\n[Org]");

    for (const provider of orgProviders) {
      const snapshotProvider = provider as SnapshotProviderPort<OrgSnapshot>;

      if (!("snapshot" in snapshotProvider)) {
        continue;
      }

      try {
        const scope: SnapshotScope = { maxItems: 50 };
        const result = await snapshotProvider.snapshot(scope);

        console.log(
          `  Provider: ${provider.capabilityId} (${result.data.members.length} members, ${result.data.teamCount} teams)`,
        );

        for (const member of result.data.members) {
          const extras = [member.role, member.team].join(", ");
          console.log(`    ${member.name} (${extras})`);
        }
      } catch (error) {
        console.log(
          `  ${provider.capabilityId}: Error - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async showSourceCodeContext(): Promise<void> {
    const sourceProviders = this.providerRegistry.getByKind("sourcecode");

    if (sourceProviders.length === 0) {
      console.log("\n[SourceCode] No source code providers configured");
      return;
    }

    console.log("\n[SourceCode]");

    for (const provider of sourceProviders) {
      const snapshotProvider =
        provider as SnapshotProviderPort<SourceCodeSnapshot>;

      if (!("snapshot" in snapshotProvider)) {
        continue;
      }

      try {
        const scope: SnapshotScope = { maxItems: 10 };
        const result = await snapshotProvider.snapshot(scope);

        console.log(
          `  Provider: ${provider.capabilityId} (${result.data.length} repos)`,
        );

        for (const repo of result.data) {
          console.log(`    ${repo.name} [${repo.branch}] ${repo.commitSha.slice(0, 8)}`);
          console.log(`      Last commit: ${repo.commitMessage}`);
          if (repo.uncommittedChanges > 0) {
            console.log(`      Uncommitted changes: ${repo.uncommittedChanges}`);
          }
        }
      } catch (error) {
        console.log(
          `  ${provider.capabilityId}: Error - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
