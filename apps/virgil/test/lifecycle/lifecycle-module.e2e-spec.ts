import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LifecycleModule } from '../../src/lifecycle/lifecycle.module.js';
import { LifecycleMetricsService } from '../../src/lifecycle/lifecycle-metrics.service.js';
import { LifecyclePolicyService } from '../../src/lifecycle/lifecycle-policy.service.js';
import { StateTransitionService } from '../../src/lifecycle/state-transition.service.js';
import { CompactionService } from '../../src/lifecycle/compaction.service.js';
import { REHYDRATION_PROVIDER } from '../../src/lifecycle/lifecycle.constants.js';

describe('LifecycleModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        LifecycleModule.forRoot({
          databasePath: ':memory:',
          runMigrations: true,
        }),
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('compiles successfully', () => {
    expect(module).toBeDefined();
  });

  it('resolves LifecycleMetricsService', () => {
    expect(module.get(LifecycleMetricsService)).toBeInstanceOf(
      LifecycleMetricsService,
    );
  });

  it('resolves LifecyclePolicyService', () => {
    expect(module.get(LifecyclePolicyService)).toBeInstanceOf(
      LifecyclePolicyService,
    );
  });

  it('resolves StateTransitionService', () => {
    expect(module.get(StateTransitionService)).toBeInstanceOf(
      StateTransitionService,
    );
  });

  it('resolves CompactionService', () => {
    expect(module.get(CompactionService)).toBeInstanceOf(CompactionService);
  });

  it('REHYDRATION_PROVIDER defaults to null', () => {
    const provider = module.get(REHYDRATION_PROVIDER);
    expect(provider).toBeNull();
  });
});
