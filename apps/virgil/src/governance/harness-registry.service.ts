import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import type { HarnessAdapter } from './harness-adapter.port.js';
import { AdapterNotFoundError } from './governance.errors.js';

@Injectable()
export class HarnessRegistry {
  private readonly adapters = new Map<CapabilityTier, HarnessAdapter>();

  register(tier: CapabilityTier, adapter: HarnessAdapter): void {
    this.adapters.set(tier, adapter);
  }

  resolve(tier: CapabilityTier): HarnessAdapter {
    const adapter = this.adapters.get(tier);
    if (!adapter) {
      throw new AdapterNotFoundError(tier);
    }
    return adapter;
  }
}
