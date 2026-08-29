import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/app-config.module.js";
import { CapabilityRegistryModule } from "./capabilities/capability-registry.module.js";
import { ProviderRegistryModule } from "./providers/provider-registry.module.js";
import { DogmaLocalConfig } from "./providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "./providers/dogma/local/dogma-local.module.js";
import { GithubWikiConfig } from "./providers/dogma/github-wiki/github-wiki.config.js";
import { GithubWikiModule } from "./providers/dogma/github-wiki/github-wiki.module.js";
import { JiraConfig } from "./providers/ticket/jira/jira.config.js";
import { JiraModule } from "./providers/ticket/jira/jira.module.js";
import { GithubIssuesConfig } from "./providers/ticket/github/github-issues.config.js";
import { GithubIssuesModule } from "./providers/ticket/github/github-issues.module.js";
import { OrgLocalConfig } from "./providers/org/local/org-local.config.js";
import { OrgLocalModule } from "./providers/org/local/org-local.module.js";
import { SourceCodeLocalConfig } from "./providers/sourcecode/local/sourcecode-local.config.js";
import { SourceCodeLocalModule } from "./providers/sourcecode/local/sourcecode-local.module.js";
import { RefResolverModule } from "./domain/ref-resolver.module.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { HandoffModule } from "./handoff/handoff.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { ReactiveModule } from "./reactive/reactive.module.js";
import { SlackConfig } from "./providers/chat/slack/slack.config.js";
import { SlackModule } from "./providers/chat/slack/slack.module.js";
import { ProactiveModule } from "./proactive/proactive.module.js";
import { BriefModule } from "./brief/brief.module.js";
import { StatusCommand } from "./commands/status.command.js";
import { ContextCommand } from "./commands/context.command.js";
import { HandoffCommand } from "./commands/handoff.command.js";
import { HandoffCreateCommand } from "./commands/handoff-create.command.js";
import { HandoffListCommand } from "./commands/handoff-list.command.js";
import { HandoffShowCommand } from "./commands/handoff-show.command.js";
import { HandoffTransitionCommand } from "./commands/handoff-transition.command.js";
import { AuditCommand } from "./commands/audit.command.js";
import { LedgerCommand } from "./commands/ledger.command.js";
import { WatchCommand } from "./commands/watch.command.js";
import { InsightsCommand } from "./commands/insights.command.js";
import { BriefCommand } from "./commands/brief.command.js";

@Module({
  imports: [
    AppConfigModule.forRoot([
      DogmaLocalConfig,
      GithubWikiConfig,
      JiraConfig,
      GithubIssuesConfig,
      OrgLocalConfig,
      SourceCodeLocalConfig,
      SlackConfig,
    ]),
    CapabilityRegistryModule,
    ProviderRegistryModule,
    DogmaLocalModule.registerIfConfigured(),
    GithubWikiModule.registerIfConfigured(),
    JiraModule.registerIfConfigured(),
    GithubIssuesModule.registerIfConfigured(),
    OrgLocalModule.registerIfConfigured(),
    SourceCodeLocalModule.registerIfConfigured(),
    SlackModule.registerIfConfigured(),
    RefResolverModule,
    LedgerModule,
    HandoffModule,
    AuditModule,
    ReactiveModule,
    ProactiveModule,
    BriefModule,
  ],
  providers: [
    StatusCommand,
    ContextCommand,
    HandoffCommand,
    HandoffCreateCommand,
    HandoffListCommand,
    HandoffShowCommand,
    HandoffTransitionCommand,
    AuditCommand,
    LedgerCommand,
    WatchCommand,
    InsightsCommand,
    BriefCommand,
  ],
})
export class AppModule {}
