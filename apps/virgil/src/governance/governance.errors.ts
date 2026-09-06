import type { CapabilityTier } from './capability-tier.js';

export class AdapterNotFoundError extends Error {
  readonly tier: CapabilityTier;

  constructor(tier: CapabilityTier) {
    super(`No adapter registered for tier "${tier}"`);
    this.name = 'AdapterNotFoundError';
    this.tier = tier;
  }
}
