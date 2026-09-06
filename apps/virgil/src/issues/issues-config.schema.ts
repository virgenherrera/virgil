import { z } from 'zod';

export enum GitHubAdapterPreference {
  API = 'api',
  CDP = 'cdp',
  AUTO = 'auto',
}

export const GitHubAdapterPreferenceSchema = z.nativeEnum(GitHubAdapterPreference);

export const GitHubCredentialRefSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('env'), variableName: z.string().min(1) }),
  z.object({ source: z.literal('keychain'), service: z.string().min(1), account: z.string().min(1) }),
  z.object({ source: z.literal('file'), path: z.string().min(1) }),
]);

export type GitHubCredentialRef = z.infer<typeof GitHubCredentialRefSchema>;

export const GitHubIssuesConfigSchema = z.object({
  owner: z.string().min(1).regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/),
  repo: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/),
  baseUrl: z.string().url().default('https://api.github.com'),
  adapterPreference: GitHubAdapterPreferenceSchema.default(GitHubAdapterPreference.API),
  credentialRef: GitHubCredentialRefSchema.optional(),
  perPage: z.number().int().positive().max(100).default(30),
});

export type GitHubIssuesConfig = z.infer<typeof GitHubIssuesConfigSchema>;
export type GitHubIssuesConfigInput = z.input<typeof GitHubIssuesConfigSchema>;
