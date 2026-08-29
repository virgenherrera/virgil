import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const GithubIssuesConfigSchema = z
  .object({
    VIRGIL_GITHUB_TOKEN: z.string().optional(),
    VIRGIL_GITHUB_OWNER: z.string().optional(),
    VIRGIL_GITHUB_REPO: z.string().optional(),
    VIRGIL_GITHUB_API_URL: z.string().optional(),
  })
  .transform((data) => {
    const fields = [
      data.VIRGIL_GITHUB_TOKEN,
      data.VIRGIL_GITHUB_OWNER,
      data.VIRGIL_GITHUB_REPO,
    ];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 3;
    const partial = setCount > 0 && setCount < 3;

    return {
      token: data.VIRGIL_GITHUB_TOKEN ?? "",
      owner: data.VIRGIL_GITHUB_OWNER ?? "",
      repo: data.VIRGIL_GITHUB_REPO ?? "",
      apiUrl: data.VIRGIL_GITHUB_API_URL ?? "https://api.github.com",
      configured,
      partial,
    };
  });

export type GithubIssuesConfigType = z.infer<typeof GithubIssuesConfigSchema>;

export const GITHUB_CONFIG_TOKEN = "CONFIG_GITHUB";

export const GithubIssuesConfig: ConfigClass = {
  namespace: "github",
  schema: GithubIssuesConfigSchema,
};
