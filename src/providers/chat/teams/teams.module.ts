import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import { TeamsConfig, TEAMS_CONFIG_TOKEN } from "./teams.config.js";
import { TeamsHttpClientService } from "./teams-http-client.service.js";
import { TeamsReaderService } from "./teams-reader.service.js";

@Module({})
export class TeamsModule {
  static registerIfConfigured(): DynamicModule {
    const result = TeamsConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: TeamsModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial Teams configuration detected. When any VIRGIL_TEAMS_* env var is set, all must be provided: VIRGIL_TEAMS_TOKEN, VIRGIL_TEAMS_TEAM_ID, VIRGIL_TEAMS_CHANNEL_IDS",
      );
    }

    if (!data.configured) {
      return { module: TeamsModule };
    }

    return {
      module: TeamsModule,
      providers: [
        {
          provide: TEAMS_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        TeamsHttpClientService,
        TeamsReaderService,
      ],
      exports: [TeamsReaderService],
    };
  }
}
