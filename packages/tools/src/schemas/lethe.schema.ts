import { z } from 'zod';

export const LetheTaskTypeSchema = z.enum([
  'readFile',
  'readJson',
  'crawlDirs',
  'rawInput',
  'phaseOutput',
]);
export type LetheTaskType = z.infer<typeof LetheTaskTypeSchema>;

export const LetheConfigSchema = z.object({
  enabled: z.boolean().default(false),
  tasks: z
    .object({
      readFile: z.boolean().default(true),
      readJson: z.boolean().default(true),
      crawlDirs: z.boolean().default(true),
      rawInput: z.boolean().default(true),
      phaseOutput: z.boolean().default(true),
    })
    .default({
      readFile: true,
      readJson: true,
      crawlDirs: true,
      rawInput: true,
      phaseOutput: true,
    }),
});
export type LetheConfig = z.infer<typeof LetheConfigSchema>;

export const LetheResultSchema = z.object({
  task: LetheTaskTypeSchema,
  input: z.string(),
  output: z.string(),
  elapsed_ms: z.number(),
});
export type LetheResult = z.infer<typeof LetheResultSchema>;
