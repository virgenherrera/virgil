import type { CapabilityTier } from './capability-tier.js';

/** Opaque task payload dispatched to an adapter. */
export interface HarnessTask {
  readonly taskId: string;
  readonly payload: unknown;
}

/** Result returned after adapter execution. */
export interface HarnessResult {
  readonly taskId: string;
  readonly output: unknown;
}

/**
 * Vendor-neutral adapter contract for agent execution harnesses (H11 D3).
 * Each adapter bridges the governance layer to a concrete execution backend
 * without exposing vendor model names in the domain.
 */
export interface HarnessAdapter {
  /** Returns the capability tiers this adapter can handle. */
  supportedTiers(): readonly CapabilityTier[];

  /** Executes a task at the given capability tier. */
  execute(task: HarnessTask, tier: CapabilityTier): Promise<HarnessResult>;

  /** Returns a description of what this adapter can do. */
  capabilities(): Record<string, unknown>;
}
