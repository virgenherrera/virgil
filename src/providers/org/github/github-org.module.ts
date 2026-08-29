import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import {
  GithubOrgConfig,
  GITHUB_ORG_CONFIG_TOKEN,
} from "./github-org.config.js";
import { GithubOrgHttpClientService } from "./github-org-http-client.service.js";
import { GithubOrgService } from "./github-org.service.js";

@Module({})
export class GithubOrgModule {
  static registerIfConfigured(): DynamicModule {
    const result = GithubOrgConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: GithubOrgModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial GitHub Org configuration detected. VIRGIL_GITHUB_ORG_NAME requires either VIRGIL_GITHUB_ORG_TOKEN or VIRGIL_GITHUB_TOKEN to be set",
      );
    }

    if (!data.configured) {
      return { module: GithubOrgModule };
    }

    return {
      module: GithubOrgModule,
      providers: [
        {
          provide: GITHUB_ORG_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        GithubOrgHttpClientService,
        GithubOrgService,
      ],
      exports: [GithubOrgService],
    };
  }
}
