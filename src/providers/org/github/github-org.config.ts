import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const GithubOrgConfigSchema = z
  .object({
    VIRGIL_GITHUB_ORG_TOKEN: z.string().optional(),
    VIRGIL_GITHUB_ORG_NAME: z.string().optional(),
    VIRGIL_GITHUB_ORG_API_URL: z.string().optional(),
    VIRGIL_GITHUB_TOKEN: z.string().optional(),
  })
  .transform((data) => {
    const token = data.VIRGIL_GITHUB_ORG_TOKEN ?? data.VIRGIL_GITHUB_TOKEN;
    const orgName = data.VIRGIL_GITHUB_ORG_NAME;
    const configured = Boolean(token && orgName);
    const partial = Boolean(!configured && orgName);

    return {
      token: token ?? "",
      orgName: orgName ?? "",
      apiUrl: data.VIRGIL_GITHUB_ORG_API_URL ?? "https://api.github.com",
      configured,
      partial,
    };
  });

export type GithubOrgConfigType = z.infer<typeof GithubOrgConfigSchema>;

export const GITHUB_ORG_CONFIG_TOKEN = "CONFIG_GITHUB_ORG";

export const GithubOrgConfig: ConfigClass = {
  namespace: "github_org",
  schema: GithubOrgConfigSchema,
};
