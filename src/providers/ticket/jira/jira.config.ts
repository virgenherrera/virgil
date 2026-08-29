import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const JiraConfigSchema = z
  .object({
    VIRGIL_JIRA_SITE_URL: z.string().optional(),
    VIRGIL_JIRA_EMAIL: z.string().optional(),
    VIRGIL_JIRA_API_TOKEN: z.string().optional(),
    VIRGIL_JIRA_BOARD_ID: z.string().optional(),
  })
  .transform((data) => {
    const fields = [
      data.VIRGIL_JIRA_SITE_URL,
      data.VIRGIL_JIRA_EMAIL,
      data.VIRGIL_JIRA_API_TOKEN,
      data.VIRGIL_JIRA_BOARD_ID,
    ];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 4;
    const partial = setCount > 0 && setCount < 4;

    return {
      siteUrl: data.VIRGIL_JIRA_SITE_URL ?? "",
      email: data.VIRGIL_JIRA_EMAIL ?? "",
      apiToken: data.VIRGIL_JIRA_API_TOKEN ?? "",
      boardId: data.VIRGIL_JIRA_BOARD_ID ?? "",
      configured,
      partial,
    };
  });

export type JiraConfigType = z.infer<typeof JiraConfigSchema>;

export const JIRA_CONFIG_TOKEN = "CONFIG_JIRA";

export const JiraConfig: ConfigClass = {
  namespace: "jira",
  schema: JiraConfigSchema,
};
