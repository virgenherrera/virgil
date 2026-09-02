import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import type { PersistenceModuleOptions } from '../persistence/database.provider.js';
import { CompactionService } from './compaction.service.js';
import { REHYDRATION_PROVIDER } from './lifecycle.constants.js';
import { LifecycleMetricsService } from './lifecycle-metrics.service.js';
import { LifecyclePolicyService } from './lifecycle-policy.service.js';
import { StateTransitionService } from './state-transition.service.js';

const SERVICES = [
  LifecycleMetricsService,
  LifecyclePolicyService,
  StateTransitionService,
  CompactionService,
];

/**
 * Hosts the H15 knowledge lifecycle layer: metrics collection, policy
 * evaluation, state transitions, and compaction.
 *
 * Uses `forRoot` to accept PersistenceModule options so it shares the
 * caller's database connection instead of creating a second one.
 *
 * Exports {@link LifecyclePolicyService}, {@link StateTransitionService},
 * {@link CompactionService}, and {@link LifecycleMetricsService} for
 * injection by consuming modules.
 */
@Module({})
export class LifecycleModule {
  static forRoot(
    persistenceOptions: PersistenceModuleOptions = {},
  ): DynamicModule {
    return {
      module: LifecycleModule,
      imports: [PersistenceModule.forRoot(persistenceOptions)],
      providers: [
        ...SERVICES,
        { provide: REHYDRATION_PROVIDER, useValue: null },
      ],
      exports: [...SERVICES],
    };
  }
}
