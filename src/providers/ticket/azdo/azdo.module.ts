import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import { AzdoConfig, AZDO_CONFIG_TOKEN } from "./azdo.config.js";
import { AzdoHttpClientService } from "./azdo-http-client.service.js";
import { AzdoReaderService } from "./azdo-reader.service.js";

@Module({})
export class AzdoModule {
  static registerIfConfigured(): DynamicModule {
    const result = AzdoConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: AzdoModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial Azure DevOps configuration detected. When any VIRGIL_AZDO_* env var is set, all must be provided: VIRGIL_AZDO_ORG_URL, VIRGIL_AZDO_PROJECT, VIRGIL_AZDO_PAT",
      );
    }

    if (!data.configured) {
      return { module: AzdoModule };
    }

    return {
      module: AzdoModule,
      providers: [
        {
          provide: AZDO_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        AzdoHttpClientService,
        AzdoReaderService,
      ],
      exports: [AzdoReaderService],
    };
  }
}
