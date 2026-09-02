import { CapabilityTier } from './capability-tier.js';
import type {
  HarnessAdapter,
  HarnessTask,
  HarnessResult,
} from './harness-adapter.port.js';

/**
 * Stub adapter implementing {@link HarnessAdapter} for all three tiers
 * (H11 D3). Used exclusively for testing — records calls and returns
 * echo results.
 */
export class StubHarnessAdapter implements HarnessAdapter {
  private readonly _calls: Array<{ task: HarnessTask; tier: CapabilityTier }> =
    [];

  supportedTiers(): readonly CapabilityTier[] {
    return [CapabilityTier.Worker, CapabilityTier.Reasoning, CapabilityTier.Pro];
  }

  async execute(task: HarnessTask, tier: CapabilityTier): Promise<HarnessResult> {
    this._calls.push({ task, tier });
    return {
      taskId: task.taskId,
      output: { echo: task.payload, tier },
    };
  }

  capabilities(): Record<string, unknown> {
    return { type: 'stub', tiers: this.supportedTiers() };
  }

  get calls(): ReadonlyArray<{ task: HarnessTask; tier: CapabilityTier }> {
    return this._calls;
  }
}
