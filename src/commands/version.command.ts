import { Command, CommandRunner } from "nest-commander";
import { readFileSync } from "node:fs";

@Command({
  name: "version",
  description: "Show Virgil CLI version",
})
export class VersionCommand extends CommandRunner {
  async run(): Promise<void> {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    );
    console.log(`virgil ${pkg.version}`);
  }
}
