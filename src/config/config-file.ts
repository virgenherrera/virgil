import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const CONFIG_FILES = [".virgilrc.yaml", ".virgilrc.json"] as const;

export function loadConfigFile(startDir?: string): void {
  const dir = startDir ?? process.cwd();
  const filePath = findConfigFile(dir);
  if (!filePath) return;

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return;

  let config: Record<string, unknown>;

  if (filePath.endsWith(".json")) {
    config = JSON.parse(content);
  } else {
    config = (yaml.load(content) as Record<string, unknown>) ?? {};
  }

  for (const [key, value] of Object.entries(config)) {
    // Security: only apply VIRGIL_ prefixed keys
    if (!key.startsWith("VIRGIL_")) continue;
    // Env vars take precedence
    if (process.env[key] !== undefined) continue;
    // Convert to string (YAML may parse numbers/booleans)
    process.env[key] = String(value);
  }
}

function findConfigFile(startDir: string): string | null {
  for (const filename of CONFIG_FILES) {
    const filepath = join(startDir, filename);
    if (existsSync(filepath)) return filepath;
  }
  return null;
}
