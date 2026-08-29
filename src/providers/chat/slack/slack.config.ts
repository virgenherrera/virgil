import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const SlackConfigSchema = z
  .object({
    VIRGIL_SLACK_BOT_TOKEN: z.string().optional(),
    VIRGIL_SLACK_CHANNELS: z.string().optional(),
  })
  .transform((data) => {
    const fields = [data.VIRGIL_SLACK_BOT_TOKEN, data.VIRGIL_SLACK_CHANNELS];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 2;
    const partial = setCount > 0 && setCount < 2;

    return {
      botToken: data.VIRGIL_SLACK_BOT_TOKEN ?? "",
      channels: data.VIRGIL_SLACK_CHANNELS
        ? data.VIRGIL_SLACK_CHANNELS.split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [],
      configured,
      partial,
    };
  });

export type SlackConfigType = z.infer<typeof SlackConfigSchema>;

export const SLACK_CONFIG_TOKEN = "CONFIG_SLACK";

export const SlackConfig: ConfigClass = {
  namespace: "slack",
  schema: SlackConfigSchema,
};
