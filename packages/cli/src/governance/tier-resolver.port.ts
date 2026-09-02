import type { CapabilityTier } from './capability-tier.js';
import type { TaskDescriptor } from './task-descriptor.schema.js';

/**
 * Port for resolving the appropriate capability tier from a task descriptor
 * (H11 D2). Implementations MUST NOT return {@link CapabilityTier.Pro}
 * directly; the pro tier is reachable only via human-gated escalation.
 */
export interface TierResolver {
  resolve(descriptor: TaskDescriptor): CapabilityTier;
}
