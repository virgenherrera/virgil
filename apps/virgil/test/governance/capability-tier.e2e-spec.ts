import { CapabilityTier } from '../../src/governance/capability-tier.js';

describe('CapabilityTier', () => {
  it('exposes Worker tier', () => {
    expect(CapabilityTier.Worker).toBe('worker');
  });

  it('exposes Reasoning tier', () => {
    expect(CapabilityTier.Reasoning).toBe('reasoning');
  });

  it('exposes Pro tier', () => {
    expect(CapabilityTier.Pro).toBe('pro');
  });

  it('contains exactly three members', () => {
    expect(Object.values(CapabilityTier)).toHaveLength(3);
  });
});
