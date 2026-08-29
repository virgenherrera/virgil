import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InitCommand } from "../commands/init.command.js";

describe("init command", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "virgil-init-"));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates .virgilrc.yaml template", async () => {
    const command = new InitCommand();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await command.run([]);

    const configPath = join(testDir, ".virgilrc.yaml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("VIRGIL_GITHUB_TOKEN");
    expect(content).toContain("VIRGIL_CONFLUENCE_SITE_URL");
    expect(content).toContain("VIRGIL_JIRA_SITE_URL");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Created .virgilrc.yaml"),
    );
    consoleSpy.mockRestore();
  });

  it("does not overwrite existing .virgilrc.yaml", async () => {
    const configPath = join(testDir, ".virgilrc.yaml");
    writeFileSync(configPath, "VIRGIL_GITHUB_TOKEN: my-secret\n");

    const command = new InitCommand();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await command.run([]);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe("VIRGIL_GITHUB_TOKEN: my-secret\n");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    consoleSpy.mockRestore();
  });
});
