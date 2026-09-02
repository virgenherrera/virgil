import { Injectable } from '@nestjs/common';
import { CapabilityTier } from './capability-tier.js';
import type { TaskDescriptor } from './task-descriptor.schema.js';
import type { TierResolver } from './tier-resolver.port.js';
import type { ComplexitySignal } from './task-descriptor.schema.js';

/** Signals that map to the worker tier. */
const WORKER_SIGNALS: ReadonlySet<ComplexitySignal> = new Set([
  'mechanical',
  'search',
  'extraction',
]);

/** Signals that map to the reasoning tier. */
const REASONING_SIGNALS: ReadonlySet<ComplexitySignal> = new Set([
  'architecture',
  'synthesis',
  'review',
]);

/**
 * Rule-based tier resolver (H11 D2). Maps complexity signals to capability
 * tiers via static rules. Pro is NEVER returned — it requires escalation.
 */
@Injectable()
export class RuleBasedTierResolver implements TierResolver {
  resolve(descriptor: TaskDescriptor): CapabilityTier {
    if (WORKER_SIGNALS.has(descriptor.complexitySignal)) {
      return CapabilityTier.Worker;
    }
    if (REASONING_SIGNALS.has(descriptor.complexitySignal)) {
      return CapabilityTier.Reasoning;
    }

    // Fallback: unknown signals default to reasoning (never pro).
    return CapabilityTier.Reasoning;
  }
}
