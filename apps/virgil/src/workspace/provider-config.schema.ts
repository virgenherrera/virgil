import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';
import { CredentialRefSchema } from './credential.schema.js';

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

export const ProviderConfigSchema = z.discriminatedUnion('type', [
  GithubIssuesProviderConfigSchema,
  LocalFsProviderConfigSchema,
]);

export const NewProviderConfigInputSchema = z.discriminatedUnion('type', [
  NewGithubIssuesProviderInputSchema,
  NewLocalFsProviderInputSchema,
]);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type NewProviderConfigInput = z.infer<
  typeof NewProviderConfigInputSchema
>;
