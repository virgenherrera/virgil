import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import type { TaskDescriptor, ComplexitySignal } from './task-descriptor.schema.js';
import type { TierResolver } from './tier-resolver.port.js';

const WORKER_SIGNALS: ReadonlySet<ComplexitySignal> = new Set([
  'mechanical',
  'search',
  'extraction',
]);

const REASONING_SIGNALS: ReadonlySet<ComplexitySignal> = new Set([
  'architecture',
  'synthesis',
  'review',
]);

@Injectable()
export class RuleBasedTierResolver implements TierResolver {
  resolve(descriptor: TaskDescriptor): CapabilityTier {
    if (WORKER_SIGNALS.has(descriptor.complexitySignal)) {
      return CapabilityTier.Worker;
    }
    if (REASONING_SIGNALS.has(descriptor.complexitySignal)) {
      return CapabilityTier.Reasoning;
    }
    return CapabilityTier.Reasoning;
  }
}
