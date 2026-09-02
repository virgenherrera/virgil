import type { CapabilityTier } from './capability-tier.js';

/**
 * Thrown when no adapter is registered for the requested capability tier.
 */
export class AdapterNotFoundError extends Error {
  readonly tier: CapabilityTier;

  constructor(tier: CapabilityTier) {
    super(`No adapter registered for tier "${tier}"`);
    this.name = 'AdapterNotFoundError';
    this.tier = tier;
  }
}
