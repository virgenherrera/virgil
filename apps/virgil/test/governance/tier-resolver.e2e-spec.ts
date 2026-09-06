import { CapabilityTier } from '../../src/governance/capability-tier.js';
import { RuleBasedTierResolver } from '../../src/governance/rule-based-tier-resolver.js';
import type { TaskDescriptor } from '../../src/governance/task-descriptor.schema.js';

function makeDescriptor(
  signal: TaskDescriptor['complexitySignal'],
): TaskDescriptor {
  return {
    taskType: 'test',
    estimatedTokenWeight: 100,
    complexitySignal: signal,
    isMechanical: signal === 'mechanical',
  };
}

describe('RuleBasedTierResolver', () => {
  let resolver: RuleBasedTierResolver;

  beforeEach(() => {
    resolver = new RuleBasedTierResolver();
  });

  it('maps mechanical signal to Worker', () => {
    expect(resolver.resolve(makeDescriptor('mechanical'))).toBe(
      CapabilityTier.Worker,
    );
  });

  it('maps search signal to Worker', () => {
    expect(resolver.resolve(makeDescriptor('search'))).toBe(
      CapabilityTier.Worker,
    );
  });

  it('maps extraction signal to Worker', () => {
    expect(resolver.resolve(makeDescriptor('extraction'))).toBe(
      CapabilityTier.Worker,
    );
  });

  it('maps architecture signal to Reasoning', () => {
    expect(resolver.resolve(makeDescriptor('architecture'))).toBe(
      CapabilityTier.Reasoning,
    );
  });

  it('maps synthesis signal to Reasoning', () => {
    expect(resolver.resolve(makeDescriptor('synthesis'))).toBe(
      CapabilityTier.Reasoning,
    );
  });

  it('maps review signal to Reasoning', () => {
    expect(resolver.resolve(makeDescriptor('review'))).toBe(
      CapabilityTier.Reasoning,
    );
  });

  it('NEVER returns Pro for any known signal', () => {
    const signals: TaskDescriptor['complexitySignal'][] = [
      'mechanical',
      'synthesis',
      'review',
      'architecture',
      'search',
      'extraction',
    ];
    for (const signal of signals) {
      expect(resolver.resolve(makeDescriptor(signal))).not.toBe(
        CapabilityTier.Pro,
      );
    }
  });
});
