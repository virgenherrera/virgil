import { z } from 'zod';

export const ModelsResponseSchema = z.object({
  object: z.string(),
  data: z.array(
    z
      .object({
        id: z.string(),
        object: z.string(),
      })
      .passthrough(),
  ),
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

export const ChatResponseSchema = z.object({
  choices: z.array(
    z
      .object({
        index: z.number(),
        message: z.object({
          role: z.string(),
          content: z.string(),
        }),
      })
      .passthrough(),
  ),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
