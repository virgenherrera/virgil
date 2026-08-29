import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import { JiraConfig, JIRA_CONFIG_TOKEN } from "./jira.config.js";
import { JiraHttpClientService } from "./jira-http-client.service.js";
import { JiraReaderService } from "./jira-reader.service.js";

@Module({})
export class JiraModule {
  static registerIfConfigured(): DynamicModule {
    const result = JiraConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: JiraModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial Jira configuration detected. When any VIRGIL_JIRA_* env var is set, all must be provided: VIRGIL_JIRA_SITE_URL, VIRGIL_JIRA_EMAIL, VIRGIL_JIRA_API_TOKEN, VIRGIL_JIRA_BOARD_ID",
      );
    }

    if (!data.configured) {
      return { module: JiraModule };
    }

    return {
      module: JiraModule,
      providers: [
        {
          provide: JIRA_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        JiraHttpClientService,
        JiraReaderService,
      ],
      exports: [JiraReaderService],
    };
  }
}
