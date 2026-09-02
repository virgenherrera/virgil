import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import type { HarnessAdapter } from './harness-adapter.port.js';
import { AdapterNotFoundError } from './governance.errors.js';

/**
 * Registry of harness adapters keyed by capability tier (H11 D3).
 * Concrete adapters are registered at module bootstrap; the governance
 * layer resolves adapters through this registry at dispatch time.
 */
@Injectable()
export class HarnessRegistry {
  private readonly adapters = new Map<CapabilityTier, HarnessAdapter>();

  /** Register an adapter for a given tier. */
  register(tier: CapabilityTier, adapter: HarnessAdapter): void {
    this.adapters.set(tier, adapter);
  }

  /**
   * Resolve the adapter registered for the given tier.
   * @throws {AdapterNotFoundError} when no adapter is registered.
   */
  resolve(tier: CapabilityTier): HarnessAdapter {
    const adapter = this.adapters.get(tier);
    if (!adapter) {
      throw new AdapterNotFoundError(tier);
    }
    return adapter;
  }
}
