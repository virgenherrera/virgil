import { z } from 'zod';

export const VersionOutputSchema = z.object({
  version: z.string().min(1),
});

export type VersionOutput = z.infer<typeof VersionOutputSchema>;
