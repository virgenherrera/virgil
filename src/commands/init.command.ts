import { Command, CommandRunner } from "nest-commander";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE = `# Virgil configuration
# Uncomment and fill in the providers you want to use.
# Environment variables always override these values.

# --- GitHub Issues ---
# VIRGIL_GITHUB_TOKEN:
# VIRGIL_GITHUB_OWNER:
# VIRGIL_GITHUB_REPO:

# --- GitHub Org ---
# VIRGIL_GITHUB_ORG_NAME:
# (uses VIRGIL_GITHUB_TOKEN if VIRGIL_GITHUB_ORG_TOKEN is not set)

# --- GitHub Wiki ---
# VIRGIL_GITHUB_WIKI_OWNER:
# VIRGIL_GITHUB_WIKI_REPO:
# VIRGIL_GITHUB_WIKI_TOKEN:

# --- Confluence ---
# VIRGIL_CONFLUENCE_SITE_URL:
# VIRGIL_CONFLUENCE_EMAIL:
# VIRGIL_CONFLUENCE_API_TOKEN:
# VIRGIL_CONFLUENCE_SPACE_KEY:

# --- Jira ---
# VIRGIL_JIRA_SITE_URL:
# VIRGIL_JIRA_EMAIL:
# VIRGIL_JIRA_API_TOKEN:
# VIRGIL_JIRA_BOARD_ID:

# --- Org (local file) ---
# VIRGIL_ORG_PATH: ./team.yaml

# --- Source Code ---
# VIRGIL_SOURCECODE_PATH: .

# --- Slack ---
# VIRGIL_SLACK_TOKEN:
# VIRGIL_SLACK_CHANNEL:

# --- Verification Gates ---
# VIRGIL_COVERAGE_THRESHOLD: 80
# VIRGIL_TYPE_CHECK: true
# VIRGIL_MAX_CRITICAL_CVES: 0
# VIRGIL_MAX_COMPLEXITY: 15
# VIRGIL_CHECK_CIRCULAR_DEPS: true
# VIRGIL_MAX_MAJOR_OUTDATED: 0
`;

@Command({
  name: "init",
  description: "Generate .virgilrc.yaml config template",
})
export class InitCommand extends CommandRunner {
  async run(): Promise<void> {
    const configPath = join(process.cwd(), ".virgilrc.yaml");

    if (existsSync(configPath)) {
      console.log(
        ".virgilrc.yaml already exists. Remove it first to regenerate.",
      );
      return;
    }

    writeFileSync(configPath, TEMPLATE, "utf-8");
    console.log(
      "Created .virgilrc.yaml — edit it with your provider credentials.",
    );
  }
}
