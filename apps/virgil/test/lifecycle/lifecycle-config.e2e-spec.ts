import {
  LifecycleConfigSchema,
  type LifecycleConfig,
} from '../../src/lifecycle/lifecycle-config.schema.js';

describe('LifecycleConfigSchema', () => {
  it('parses a fully-specified config', () => {
    const input = {
      observation_window: 86400000,
      hot_access_threshold: 10,
      warm_access_threshold: 2,
      storage_budget_bytes: 1024,
      compaction_policy: 'on-pressure' as const,
    };

    const result = LifecycleConfigSchema.parse(input);

    expect(result.observation_window).toBe(86400000);
    expect(result.hot_access_threshold).toBe(10);
    expect(result.warm_access_threshold).toBe(2);
    expect(result.storage_budget_bytes).toBe(1024);
    expect(result.compaction_policy).toBe('on-pressure');
  });

  it('applies defaults when empty object is provided', () => {
    const result: LifecycleConfig = LifecycleConfigSchema.parse({});

    expect(result.observation_window).toBe(7 * 24 * 60 * 60 * 1000);
    expect(result.hot_access_threshold).toBe(5);
    expect(result.warm_access_threshold).toBe(1);
    expect(result.storage_budget_bytes).toBe(500 * 1024 * 1024);
    expect(result.compaction_policy).toBe('manual');
  });

  it('rejects negative observation_window', () => {
    expect(() =>
      LifecycleConfigSchema.parse({ observation_window: -1 }),
    ).toThrow();
  });

  it('rejects negative hot_access_threshold', () => {
    expect(() =>
      LifecycleConfigSchema.parse({ hot_access_threshold: -1 }),
    ).toThrow();
  });

  it('rejects non-integer warm_access_threshold', () => {
    expect(() =>
      LifecycleConfigSchema.parse({ warm_access_threshold: 1.5 }),
    ).toThrow();
  });

  it('rejects invalid compaction_policy', () => {
    expect(() =>
      LifecycleConfigSchema.parse({ compaction_policy: 'automatic' }),
    ).toThrow();
  });
});
