import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import {
  ConfluenceConfig,
  CONFLUENCE_CONFIG_TOKEN,
} from "./confluence.config.js";
import { ConfluenceHttpClientService } from "./confluence-http-client.service.js";
import { ConfluenceService } from "./confluence.service.js";

@Module({})
export class ConfluenceModule {
  static registerIfConfigured(): DynamicModule {
    const result = ConfluenceConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: ConfluenceModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial Confluence configuration detected. When any VIRGIL_CONFLUENCE_* env var is set, all required vars must be provided: VIRGIL_CONFLUENCE_SITE_URL, VIRGIL_CONFLUENCE_EMAIL, VIRGIL_CONFLUENCE_API_TOKEN",
      );
    }

    if (!data.configured) {
      return { module: ConfluenceModule };
    }

    return {
      module: ConfluenceModule,
      providers: [
        {
          provide: CONFLUENCE_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        ConfluenceHttpClientService,
        ConfluenceService,
      ],
      exports: [ConfluenceService],
    };
  }
}
