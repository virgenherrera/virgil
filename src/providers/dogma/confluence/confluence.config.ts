import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const ConfluenceConfigSchema = z
  .object({
    VIRGIL_CONFLUENCE_SITE_URL: z.string().optional(),
    VIRGIL_CONFLUENCE_EMAIL: z.string().optional(),
    VIRGIL_CONFLUENCE_API_TOKEN: z.string().optional(),
    VIRGIL_CONFLUENCE_SPACE_KEY: z.string().optional(),
  })
  .transform((data) => {
    const fields = [
      data.VIRGIL_CONFLUENCE_SITE_URL,
      data.VIRGIL_CONFLUENCE_EMAIL,
      data.VIRGIL_CONFLUENCE_API_TOKEN,
    ];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 3;
    const partial = setCount > 0 && setCount < 3;

    return {
      siteUrl: data.VIRGIL_CONFLUENCE_SITE_URL ?? "",
      email: data.VIRGIL_CONFLUENCE_EMAIL ?? "",
      apiToken: data.VIRGIL_CONFLUENCE_API_TOKEN ?? "",
      spaceKey: data.VIRGIL_CONFLUENCE_SPACE_KEY,
      configured,
      partial,
    };
  });

export type ConfluenceConfigType = z.infer<typeof ConfluenceConfigSchema>;

export const CONFLUENCE_CONFIG_TOKEN = "CONFIG_CONFLUENCE";

export const ConfluenceConfig: ConfigClass = {
  namespace: "confluence",
  schema: ConfluenceConfigSchema,
};
