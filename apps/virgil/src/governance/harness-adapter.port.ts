import type { CapabilityTier } from './capability-tier.js';

export interface HarnessTask {
  readonly taskId: string;
  readonly payload: unknown;
}

export interface HarnessResult {
  readonly taskId: string;
  readonly output: unknown;
}

export interface HarnessAdapter {
  supportedTiers(): readonly CapabilityTier[];
  execute(task: HarnessTask, tier: CapabilityTier): Promise<HarnessResult>;
  capabilities(): Record<string, unknown>;
}
