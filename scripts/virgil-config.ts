#!/usr/bin/env -S npx tsx
/**
 * virgil-config — CLI to read/write the project's virgil.json config.
 *
 * Usage:
 *   npx tsx scripts/virgil-config.ts get ceiling
 *   npx tsx scripts/virgil-config.ts set ceiling <disabled|worker|reasoning|pro>
 *   npx tsx scripts/virgil-config.ts status
 *
 * No external dependencies — Node.js built-ins only.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Ceiling = "disabled" | "worker" | "reasoning" | "pro";

const CEILINGS: readonly Ceiling[] = ["disabled", "worker", "reasoning", "pro"];

interface VirgilConfig {
  $schema: string;
  version: string;
  localMinions: {
    ceiling: Ceiling;
    allowedTiers: string[];
  };
}

const DEFAULT_CONFIG: VirgilConfig = {
  $schema: "./schemas/virgil.schema.json",
  version: "0.1.0",
  localMinions: {
    ceiling: "disabled",
    allowedTiers: [],
  },
};

function getRepoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
}

function getConfigPath(): string {
  return join(getRepoRoot(), "virgil.json");
}

function loadConfig(): VirgilConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as VirgilConfig;
}

function saveConfig(config: VirgilConfig): void {
  writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function tiersForCeiling(ceiling: Ceiling): string[] {
  switch (ceiling) {
    case "disabled":
      return [];
    case "worker":
      return ["worker"];
    case "reasoning":
      return ["worker", "reasoning"];
    case "pro":
      return ["worker", "reasoning", "pro"];
  }
}

function isCeiling(value: string): value is Ceiling {
  return (CEILINGS as readonly string[]).includes(value);
}

function cmdGet(key: string): void {
  const config = loadConfig();
  if (key === "ceiling") {
    console.log(config.localMinions.ceiling);
    return;
  }
  console.error(`Unknown key: ${key}`);
  process.exit(1);
}

function cmdSet(key: string, value: string | undefined): void {
  if (key !== "ceiling") {
    console.error(`Unknown key: ${key}`);
    process.exit(1);
  }
  if (!value || !isCeiling(value)) {
    console.error(
      `Invalid ceiling value: "${value ?? ""}". Must be one of: ${CEILINGS.join(", ")}`,
    );
    process.exit(1);
  }

  const config = existsSync(getConfigPath()) ? loadConfig() : { ...DEFAULT_CONFIG };
  config.localMinions.ceiling = value;
  config.localMinions.allowedTiers = tiersForCeiling(value);
  saveConfig(config);
  console.log(`ceiling set to "${value}" (allowedTiers: [${config.localMinions.allowedTiers.join(", ")}])`);
}

function cmdStatus(): void {
  const config = loadConfig();
  const { ceiling, allowedTiers } = config.localMinions;
  console.log("Virgil config status");
  console.log("---------------------");
  console.log(`version:       ${config.version}`);
  console.log(`ceiling:       ${ceiling}`);
  console.log(
    `allowedTiers:  ${allowedTiers.length > 0 ? allowedTiers.join(", ") : "(none)"}`,
  );
}

function main(): void {
  const [command, arg1, arg2] = process.argv.slice(2);

  switch (command) {
    case "get":
      if (!arg1) {
        console.error("Usage: virgil-config get <key>");
        process.exit(1);
      }
      cmdGet(arg1);
      break;
    case "set":
      if (!arg1) {
        console.error("Usage: virgil-config set <key> <value>");
        process.exit(1);
      }
      cmdSet(arg1, arg2);
      break;
    case "status":
      cmdStatus();
      break;
    default:
      console.error("Usage: virgil-config <get|set|status> [args...]");
      process.exit(1);
  }
}

main();
