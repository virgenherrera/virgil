// H11 — Agent Execution Governance barrel exports.

// D1 — CapabilityTier & TaskDescriptor
export { CapabilityTier } from './capability-tier.js';
export {
  TaskDescriptorSchema,
  COMPLEXITY_SIGNALS,
} from './task-descriptor.schema.js';
export type {
  TaskDescriptor,
  ComplexitySignal,
} from './task-descriptor.schema.js';

// D2 — TierResolver
export type { TierResolver } from './tier-resolver.port.js';
export { RuleBasedTierResolver } from './rule-based-tier-resolver.js';

// D3 — HarnessAdapter & Registry
export type {
  HarnessAdapter,
  HarnessTask,
  HarnessResult,
} from './harness-adapter.port.js';
export { HarnessRegistry } from './harness-registry.service.js';
export { StubHarnessAdapter } from './stub-harness-adapter.js';

// D4 — BudgetGovernor
export { BudgetPolicySchema } from './budget-policy.schema.js';
export type { BudgetPolicy } from './budget-policy.schema.js';
export { BudgetGovernor } from './budget-governor.service.js';
export type { BudgetStatus, BudgetEvent } from './budget-governor.service.js';

// D5 — Escalation Gates
export { EscalationGate } from './escalation-gate.service.js';
export type {
  EscalationRequest,
  EscalationRequestFields,
  EscalationDecision,
  AutomaticEscalationResult,
} from './escalation.types.js';

// D6 — Audit Trail
export type {
  AuditTrailStore,
  EscalationRecord,
} from './audit-trail.port.js';
export { InMemoryAuditTrail } from './in-memory-audit-trail.js';

// D7 — Module & Constants
export { GovernanceModule } from './governance.module.js';
export { TIER_RESOLVER, AUDIT_TRAIL_STORE } from './governance.constants.js';

// Errors
export { AdapterNotFoundError } from './governance.errors.js';
