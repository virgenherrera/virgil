import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';
import { CredentialRefSchema } from './credential.schema.js';

/**
 * Narrow, workspace-registration-facing classification of provider
 * families, as required by H03 (`issue`, `knowledge`, `repo`, `chat`).
 * Distinct from the broader `ProviderCapability` taxonomy defined in
 * `shared/provider.types.ts` — that enum also covers embedding,
 * vector-store, and retriever capabilities used by provider *contracts*
 * (H04+), not by workspace *registration*.
 */
export enum ProviderFamily {
  ISSUE = 'issue',
  KNOWLEDGE = 'knowledge',
  REPO = 'repo',
  CHAT = 'chat',
}

const providerCommonFields = {
  family: z.nativeEnum(ProviderFamily),
  enabled: z.boolean(),
  credentialRef: CredentialRefSchema.optional(),
};

const providerMetaFields = {
  id: z.uuid(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

/**
 * Placeholder/example provider type: a GitHub Issues connection. Real
 * provider contracts belong to H04+; this schema exists only to prove the
 * registration infrastructure works end-to-end.
 */
export const GithubIssuesProviderConfigSchema = z.object({
  ...providerMetaFields,
  ...providerCommonFields,
  type: z.literal('github-issues'),
  owner: z.string().min(1, { error: 'GitHub owner must not be empty' }),
  repo: z.string().min(1, { error: 'GitHub repo must not be empty' }),
});

export const NewGithubIssuesProviderInputSchema = z.object({
  ...providerCommonFields,
  type: z.literal('github-issues'),
  owner: z.string().min(1, { error: 'GitHub owner must not be empty' }),
  repo: z.string().min(1, { error: 'GitHub repo must not be empty' }),
});

/** Placeholder/example provider type: a local filesystem source. */
export const LocalFsProviderConfigSchema = z.object({
  ...providerMetaFields,
  ...providerCommonFields,
  type: z.literal('local-fs'),
  path: z.string().min(1, { error: 'Local path must not be empty' }),
});

export const NewLocalFsProviderInputSchema = z.object({
  ...providerCommonFields,
  type: z.literal('local-fs'),
  path: z.string().min(1, { error: 'Local path must not be empty' }),
});

/**
 * Discriminated union of provider configurations, keyed on `type`.
 * Extending this with a new provider type requires only a new branch
 * here — never a change to `WorkspaceService` or `WorkspaceFsService`.
 */
export const ProviderConfigSchema = z.discriminatedUnion('type', [
  GithubIssuesProviderConfigSchema,
  LocalFsProviderConfigSchema,
]);

/** Same discriminated union, without the server-assigned `id`/timestamp fields. */
export const NewProviderConfigInputSchema = z.discriminatedUnion('type', [
  NewGithubIssuesProviderInputSchema,
  NewLocalFsProviderInputSchema,
]);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type NewProviderConfigInput = z.infer<
  typeof NewProviderConfigInputSchema
>;
