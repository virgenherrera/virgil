import { z } from 'zod';

export const HardwareProfileSchema = z.object({
  cpu: z.object({
    arch: z.string(),
    cores: z.number().int().positive(),
    model: z.string(),
  }),
  gpu: z.object({
    type: z.enum(['metal', 'cuda', 'none']),
    cores: z.number().int().nonnegative().nullable(),
    vram: z.number().nonnegative().nullable(),
  }),
  ram: z.object({
    totalGb: z.number().positive(),
    availableGb: z.number().nonnegative(),
  }),
  disk: z.object({
    availableGb: z.number().nonnegative(),
  }),
  docker: z.object({
    engineVersion: z.string().nullable(),
    composeVersion: z.string().nullable(),
    dmrStatus: z.enum(['available', 'unavailable', 'unknown']),
    allocatedCpu: z.number().nonnegative().nullable(),
    allocatedMemoryGb: z.number().nonnegative().nullable(),
  }),
});
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;
