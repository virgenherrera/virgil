import { z } from 'zod';
import { TierSchema } from './tier.schema.js';

export const ModelCatalogEntrySchema = z.object({
  name: z.string(),
  provider: z.string(),
  parametersBillions: z.number().positive(),
  quantization: z.string(),
  tier: TierSchema,
  ramRequiredGb: z.number().positive(),
  diskRequiredGb: z.number().positive(),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

export function computeRamRequired(parametersBillions: number): number {
  return parseFloat((parametersBillions * 0.55 + 1.5).toFixed(2));
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  // Worker tier (Haiku-class)
  {
    name: 'llama3.1:8b',
    provider: 'docker.io/ai',
    parametersBillions: 8,
    quantization: 'Q4_K_M',
    tier: 'worker',
    ramRequiredGb: computeRamRequired(8),
    diskRequiredGb: 4.7,
  },
  {
    name: 'mistral:7b',
    provider: 'docker.io/ai',
    parametersBillions: 7,
    quantization: 'Q4_K_M',
    tier: 'worker',
    ramRequiredGb: computeRamRequired(7),
    diskRequiredGb: 4.1,
  },
  {
    name: 'gemma2:9b',
    provider: 'docker.io/ai',
    parametersBillions: 9,
    quantization: 'Q4_K_M',
    tier: 'worker',
    ramRequiredGb: computeRamRequired(9),
    diskRequiredGb: 5.4,
  },
  // Reasoning tier (Sonnet/Fable-class)
  {
    name: 'qwen3:32b',
    provider: 'docker.io/ai',
    parametersBillions: 32,
    quantization: 'Q4_K_M',
    tier: 'reasoning',
    ramRequiredGb: computeRamRequired(32),
    diskRequiredGb: 19.0,
  },
  {
    name: 'phi4:14b',
    provider: 'docker.io/ai',
    parametersBillions: 14,
    quantization: 'Q4_K_M',
    tier: 'reasoning',
    ramRequiredGb: computeRamRequired(14),
    diskRequiredGb: 8.4,
  },
  // Pro tier (Opus-class)
  {
    name: 'llama3.3:70b',
    provider: 'docker.io/ai',
    parametersBillions: 70,
    quantization: 'Q4_K_M',
    tier: 'pro',
    ramRequiredGb: computeRamRequired(70),
    diskRequiredGb: 40.0,
  },
  {
    name: 'qwen3:72b',
    provider: 'docker.io/ai',
    parametersBillions: 72,
    quantization: 'Q4_K_M',
    tier: 'pro',
    ramRequiredGb: computeRamRequired(72),
    diskRequiredGb: 42.0,
  },
  {
    name: 'deepseek-v3:latest',
    provider: 'docker.io/ai',
    parametersBillions: 671,
    quantization: 'Q4_K_M',
    tier: 'pro',
    ramRequiredGb: computeRamRequired(671),
    diskRequiredGb: 380.0,
  },
].map((entry) => ModelCatalogEntrySchema.parse(entry));
