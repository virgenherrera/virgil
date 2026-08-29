import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import {
  GithubWikiConfig,
  GITHUB_WIKI_CONFIG_TOKEN,
} from "./github-wiki.config.js";
import { GithubWikiService } from "./github-wiki.service.js";

@Module({})
export class GithubWikiModule {
  static registerIfConfigured(): DynamicModule {
    const result = GithubWikiConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: GithubWikiModule };
    }

    const config = result.data as { configured: boolean; partial: boolean };

    if (config.partial) {
      throw new ConfigurationError(
        "GitHub Wiki provider requires both VIRGIL_GITHUB_WIKI_OWNER and VIRGIL_GITHUB_WIKI_REPO",
      );
    }

    if (!config.configured) {
      return { module: GithubWikiModule };
    }

    return {
      module: GithubWikiModule,
      providers: [
        {
          provide: GITHUB_WIKI_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        GithubWikiService,
      ],
      exports: [GithubWikiService],
    };
  }
}
