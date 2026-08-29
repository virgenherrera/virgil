import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const TeamsConfigSchema = z
  .object({
    VIRGIL_TEAMS_TOKEN: z.string().optional(),
    VIRGIL_TEAMS_TEAM_ID: z.string().optional(),
    VIRGIL_TEAMS_CHANNEL_IDS: z.string().optional(),
  })
  .transform((data) => {
    const fields = [
      data.VIRGIL_TEAMS_TOKEN,
      data.VIRGIL_TEAMS_TEAM_ID,
      data.VIRGIL_TEAMS_CHANNEL_IDS,
    ];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 3;
    const partial = setCount > 0 && setCount < 3;

    return {
      token: data.VIRGIL_TEAMS_TOKEN ?? "",
      teamId: data.VIRGIL_TEAMS_TEAM_ID ?? "",
      channelIds: data.VIRGIL_TEAMS_CHANNEL_IDS
        ? data.VIRGIL_TEAMS_CHANNEL_IDS.split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [],
      configured,
      partial,
    };
  });

export type TeamsConfigType = z.infer<typeof TeamsConfigSchema>;

export const TEAMS_CONFIG_TOKEN = "CONFIG_TEAMS";

export const TeamsConfig: ConfigClass = {
  namespace: "teams",
  schema: TeamsConfigSchema,
};
