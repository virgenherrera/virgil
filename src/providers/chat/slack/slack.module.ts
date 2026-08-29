import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigurationError } from "../../../shared/errors.js";
import { SlackConfig, SLACK_CONFIG_TOKEN } from "./slack.config.js";
import { SlackHttpClientService } from "./slack-http-client.service.js";
import { SlackReaderService } from "./slack-reader.service.js";

@Module({})
export class SlackModule {
  static registerIfConfigured(): DynamicModule {
    const result = SlackConfig.schema.safeParse(process.env);

    if (!result.success) {
      return { module: SlackModule };
    }

    const data = result.data as {
      configured: boolean;
      partial: boolean;
    };

    if (data.partial) {
      throw new ConfigurationError(
        "Partial Slack configuration detected. When any VIRGIL_SLACK_* env var is set, all must be provided: VIRGIL_SLACK_BOT_TOKEN, VIRGIL_SLACK_CHANNELS",
      );
    }

    if (!data.configured) {
      return { module: SlackModule };
    }

    return {
      module: SlackModule,
      providers: [
        {
          provide: SLACK_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        SlackHttpClientService,
        SlackReaderService,
      ],
      exports: [SlackReaderService],
    };
  }
}
