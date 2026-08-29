import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import {
  GithubIssuesConfig,
  GITHUB_CONFIG_TOKEN,
} from "./github-issues.config.js";
import { GithubHttpClientService } from "./github-http-client.service.js";
import { GithubIssuesReaderService } from "./github-issues-reader.service.js";

@Module({})
export class GithubIssuesModule {
  static registerIfConfigured(): DynamicModule {
    const result = GithubIssuesConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: GithubIssuesModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial GitHub configuration detected. When any VIRGIL_GITHUB_* env var is set, all required vars must be provided: VIRGIL_GITHUB_TOKEN, VIRGIL_GITHUB_OWNER, VIRGIL_GITHUB_REPO",
      );
    }

    if (!data.configured) {
      return { module: GithubIssuesModule };
    }

    return {
      module: GithubIssuesModule,
      providers: [
        {
          provide: GITHUB_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        GithubHttpClientService,
        GithubIssuesReaderService,
      ],
      exports: [GithubIssuesReaderService],
    };
  }
}
