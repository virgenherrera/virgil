import { CapabilityTier } from '../../src/governance/capability-tier.js';
import { HarnessRegistry } from '../../src/governance/harness-registry.service.js';
import { StubHarnessAdapter } from '../../src/governance/stub-harness-adapter.js';
import { AdapterNotFoundError } from '../../src/governance/governance.errors.js';

describe('HarnessRegistry', () => {
  let registry: HarnessRegistry;

  beforeEach(() => {
    registry = new HarnessRegistry();
  });

  it('registers and resolves an adapter for a tier', () => {
    const adapter = new StubHarnessAdapter();
    registry.register(CapabilityTier.Worker, adapter);

    expect(registry.resolve(CapabilityTier.Worker)).toBe(adapter);
  });

  it('throws AdapterNotFoundError for unregistered tier', () => {
    expect(() => registry.resolve(CapabilityTier.Worker)).toThrow(
      AdapterNotFoundError,
    );
  });

  it('AdapterNotFoundError carries the tier', () => {
    try {
      registry.resolve(CapabilityTier.Reasoning);
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterNotFoundError);
      expect((err as AdapterNotFoundError).tier).toBe(
        CapabilityTier.Reasoning,
      );
      expect((err as AdapterNotFoundError).message).toContain('reasoning');
    }
  });

  it('overwrites a previously registered adapter', () => {
    const first = new StubHarnessAdapter();
    const second = new StubHarnessAdapter();
    registry.register(CapabilityTier.Worker, first);
    registry.register(CapabilityTier.Worker, second);

    expect(registry.resolve(CapabilityTier.Worker)).toBe(second);
  });

  it('registers adapters for different tiers independently', () => {
    const workerAdapter = new StubHarnessAdapter();
    const reasoningAdapter = new StubHarnessAdapter();

    registry.register(CapabilityTier.Worker, workerAdapter);
    registry.register(CapabilityTier.Reasoning, reasoningAdapter);

    expect(registry.resolve(CapabilityTier.Worker)).toBe(workerAdapter);
    expect(registry.resolve(CapabilityTier.Reasoning)).toBe(reasoningAdapter);
  });
});

describe('StubHarnessAdapter', () => {
  it('supports all three tiers', () => {
    const adapter = new StubHarnessAdapter();
    const tiers = adapter.supportedTiers();
    expect(tiers).toContain(CapabilityTier.Worker);
    expect(tiers).toContain(CapabilityTier.Reasoning);
    expect(tiers).toContain(CapabilityTier.Pro);
  });

  it('executes a task and returns an echo result', async () => {
    const adapter = new StubHarnessAdapter();
    const result = await adapter.execute(
      { taskId: 'task-1', payload: { data: 'test' } },
      CapabilityTier.Worker,
    );
    expect(result).toEqual({
      taskId: 'task-1',
      output: { echo: { data: 'test' }, tier: CapabilityTier.Worker },
    });
  });

  it('records calls for inspection', async () => {
    const adapter = new StubHarnessAdapter();
    await adapter.execute(
      { taskId: 'task-1', payload: 'a' },
      CapabilityTier.Worker,
    );
    await adapter.execute(
      { taskId: 'task-2', payload: 'b' },
      CapabilityTier.Reasoning,
    );
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0].tier).toBe(CapabilityTier.Worker);
    expect(adapter.calls[1].tier).toBe(CapabilityTier.Reasoning);
  });

  it('returns capabilities description', () => {
    const adapter = new StubHarnessAdapter();
    const caps = adapter.capabilities();
    expect(caps).toHaveProperty('type', 'stub');
    expect(caps).toHaveProperty('tiers');
  });
});
