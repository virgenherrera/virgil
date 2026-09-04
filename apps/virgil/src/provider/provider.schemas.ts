import { z } from 'zod';

export const ProviderTypeSchema = z.enum([
  'repo',
  'knowledge',
  'issue',
  'chat',
]);

export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProviderAddInputSchema = z.object({
  type: ProviderTypeSchema,
});

export type ProviderAddInput = z.infer<typeof ProviderAddInputSchema>;

export const ProviderAddOutputSchema = z.object({
  id: z.string(),
  type: ProviderTypeSchema,
  status: z.string(),
});

export type ProviderAddOutput = z.infer<typeof ProviderAddOutputSchema>;

export const ProviderListOutputSchema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    status: z.string(),
  }),
);

export type ProviderListOutput = z.infer<typeof ProviderListOutputSchema>;
