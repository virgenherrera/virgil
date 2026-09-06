import { z } from 'zod';

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

export interface CredentialResolver {
  resolve(ref: CredentialRef): Promise<string>;
}
