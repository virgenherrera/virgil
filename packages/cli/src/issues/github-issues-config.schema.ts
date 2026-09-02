import { z } from 'zod';

/**
 * Adapter preference for how the GitHub Issues provider resolves data.
 * `api` uses the REST API (default); `cdp` forces browser-based extraction;
 * `auto` tries the API first, falling back to CDP on failure.
 */
export enum GitHubAdapterPreference {
  API = 'api',
  CDP = 'cdp',
  AUTO = 'auto',
}

/** Validates a {@link GitHubAdapterPreference} value. */
export const GitHubAdapterPreferenceSchema = z.nativeEnum(
  GitHubAdapterPreference,
);

/**
 * Credential reference for authenticating against the GitHub API.
 * Supports environment-variable lookup, keychain, or file-based storage.
 * The resolved value is always an opaque PAT or OAuth token string.
 */
export const GitHubCredentialRefSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('env'),
    variableName: z
      .string()
      .min(1, { error: 'Variable name must not be empty' }),
  }),
  z.object({
    source: z.literal('keychain'),
    service: z.string().min(1, { error: 'Service must not be empty' }),
    account: z.string().min(1, { error: 'Account must not be empty' }),
  }),
  z.object({
    source: z.literal('file'),
    path: z.string().min(1, { error: 'Path must not be empty' }),
  }),
]);

export type GitHubCredentialRef = z.infer<typeof GitHubCredentialRefSchema>;

/**
 * Configuration entry for a GitHub Issues provider within a workspace.
 * Supports both github.com and GitHub Enterprise Server (GHES) through the
 * configurable `baseUrl`.
 */
export const GitHubIssuesConfigSchema = z.object({
  owner: z
    .string()
    .min(1, { error: 'Repository owner must not be empty' })
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/, {
      error: 'Invalid GitHub owner format',
    }),
  repo: z
    .string()
    .min(1, { error: 'Repository name must not be empty' })
    .regex(/^[a-zA-Z0-9._-]+$/, {
      error: 'Invalid GitHub repository name format',
    }),
  baseUrl: z
    .string()
    .url({ error: 'Base URL must be a valid URL' })
    .default('https://api.github.com'),
  adapterPreference: GitHubAdapterPreferenceSchema.default(
    GitHubAdapterPreference.API,
  ),
  credentialRef: GitHubCredentialRefSchema.optional(),
  /** Maximum number of items per page for paginated API requests. */
  perPage: z.number().int().positive().max(100).default(30),
});

export type GitHubIssuesConfig = z.infer<typeof GitHubIssuesConfigSchema>;
export type GitHubIssuesConfigInput = z.input<typeof GitHubIssuesConfigSchema>;
