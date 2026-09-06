import type { CapabilityTier } from './capability-tier.js';
import type { TaskDescriptor } from './task-descriptor.schema.js';

export interface TierResolver {
  resolve(descriptor: TaskDescriptor): CapabilityTier;
}
