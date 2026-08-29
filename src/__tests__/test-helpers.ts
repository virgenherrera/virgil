import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

export function createTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "virgil-test-"));
  mkdirSync(join(dir, ".virgil", "handoffs"), { recursive: true });
  return dir;
}

export function cleanTestDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function initGitRepo(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# Test");
  execSync("git add .", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "pipe" });
}
