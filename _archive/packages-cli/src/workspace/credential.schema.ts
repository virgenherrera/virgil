import { z } from 'zod';

/**
 * A credential reference is an opaque pointer to a secret held in external
 * storage — never the secret value itself. No config schema in this
 * module accepts a raw secret string; resolving the pointer into an
 * actual value is a runtime concern delegated to {@link CredentialResolver}.
 */
export const CredentialRefSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('env'),
    variableName: z
      .string()
      .min(1, { error: 'Environment variable name must not be empty' }),
  }),
  z.object({
    source: z.literal('keychain'),
    service: z.string().min(1, { error: 'Keychain service must not be empty' }),
    account: z.string().min(1, { error: 'Keychain account must not be empty' }),
  }),
  z.object({
    source: z.literal('file'),
    path: z.string().min(1, { error: 'Secret file path must not be empty' }),
  }),
]);

export type CredentialRef = z.infer<typeof CredentialRefSchema>;

/**
 * Port for resolving a {@link CredentialRef} pointer into its actual
 * secret value at runtime. Declared here, deliberately unimplemented:
 * concrete resolution (environment lookup, OS keychain access, secret
 * file read) belongs to downstream provider-adapter handoffs.
 */
export interface CredentialResolver {
  resolve(ref: CredentialRef): Promise<string>;
}
