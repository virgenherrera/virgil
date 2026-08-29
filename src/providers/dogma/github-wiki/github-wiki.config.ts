import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const GithubWikiConfigSchema = z
  .object({
    VIRGIL_GITHUB_WIKI_OWNER: z.string().optional(),
    VIRGIL_GITHUB_WIKI_REPO: z.string().optional(),
    VIRGIL_GITHUB_WIKI_TOKEN: z.string().optional(),
    VIRGIL_GITHUB_WIKI_CACHE_DIR: z.string().optional(),
  })
  .transform((data) => {
    const owner = data.VIRGIL_GITHUB_WIKI_OWNER ?? "";
    const repo = data.VIRGIL_GITHUB_WIKI_REPO ?? "";
    const hasOwner = owner !== "";
    const hasRepo = repo !== "";
    return {
      owner,
      repo,
      token: data.VIRGIL_GITHUB_WIKI_TOKEN ?? "",
      cacheDir: data.VIRGIL_GITHUB_WIKI_CACHE_DIR ?? "",
      configured: hasOwner && hasRepo,
      partial: (hasOwner && !hasRepo) || (!hasOwner && hasRepo),
    };
  });

export type GithubWikiConfigType = z.infer<typeof GithubWikiConfigSchema>;

export const GITHUB_WIKI_CONFIG_TOKEN = "CONFIG_GITHUB_WIKI";

export const GithubWikiConfig: ConfigClass = {
  namespace: "github_wiki",
  schema: GithubWikiConfigSchema,
};
