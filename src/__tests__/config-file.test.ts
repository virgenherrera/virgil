import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfigFile } from "../config/config-file.js";

describe("config file", () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "virgil-config-"));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loads values from .virgilrc.yaml into process.env", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_GITHUB_TOKEN: ghp_test123\nVIRGIL_GITHUB_OWNER: test-org\n",
    );
    delete process.env.VIRGIL_GITHUB_TOKEN;
    delete process.env.VIRGIL_GITHUB_OWNER;

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_GITHUB_TOKEN).toBe("ghp_test123");
    expect(process.env.VIRGIL_GITHUB_OWNER).toBe("test-org");
  });

  it("env vars take precedence over config file", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_GITHUB_TOKEN: from-file\n",
    );
    process.env.VIRGIL_GITHUB_TOKEN = "from-env";

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_GITHUB_TOKEN).toBe("from-env");
  });

  it("ignores non-VIRGIL_ keys", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_GITHUB_TOKEN: valid\nPATH: /evil\nHOME: /evil\n",
    );
    const originalPath = process.env.PATH;

    loadConfigFile(testDir);

    expect(process.env.PATH).toBe(originalPath);
    expect(process.env.VIRGIL_GITHUB_TOKEN).toBe("valid");
  });

  it("does not error when no config file exists", () => {
    expect(() => loadConfigFile(testDir)).not.toThrow();
  });

  it("handles empty config file", () => {
    writeFileSync(join(testDir, ".virgilrc.yaml"), "");
    expect(() => loadConfigFile(testDir)).not.toThrow();
  });

  it("supports .virgilrc.json as alternative", () => {
    writeFileSync(
      join(testDir, ".virgilrc.json"),
      JSON.stringify({ VIRGIL_GITHUB_TOKEN: "from-json" }),
    );
    delete process.env.VIRGIL_GITHUB_TOKEN;

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_GITHUB_TOKEN).toBe("from-json");
  });

  it("prefers .virgilrc.yaml over .virgilrc.json when both exist", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_GITHUB_TOKEN: from-yaml\n",
    );
    writeFileSync(
      join(testDir, ".virgilrc.json"),
      JSON.stringify({ VIRGIL_GITHUB_TOKEN: "from-json" }),
    );
    delete process.env.VIRGIL_GITHUB_TOKEN;

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_GITHUB_TOKEN).toBe("from-yaml");
  });

  it("converts numeric values to strings", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_COVERAGE_THRESHOLD: 80\n",
    );
    delete process.env.VIRGIL_COVERAGE_THRESHOLD;

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_COVERAGE_THRESHOLD).toBe("80");
  });

  it("converts boolean values to strings", () => {
    writeFileSync(
      join(testDir, ".virgilrc.yaml"),
      "VIRGIL_TYPE_CHECK: true\n",
    );
    delete process.env.VIRGIL_TYPE_CHECK;

    loadConfigFile(testDir);

    expect(process.env.VIRGIL_TYPE_CHECK).toBe("true");
  });
});
