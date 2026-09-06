/** Well-known agent role constants. Open-ended — any string is valid as a role. */
export const DISCOVERY = 'discovery';
export const RESEARCH = 'research';
export const REPOSITORY = 'repository';
export const ANALYSIS = 'analysis';
export const IMPLEMENTATION = 'implementation';
export const VERIFICATION = 'verification';
export const TECHNICAL_WRITER = 'technical_writer';

/** Structured reasons an agent may give when rejecting an assignment. */
export const REJECTION_REASONS = [
  'insufficient_information',
  'missing_access',
  'conflicting_constraints',
  'exceeds_authority',
  'not_auditable',
  'upstream_dependency',
  'unavailable_capability',
  'safety_conflict',
  'other',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** Model-tier requirements forwarded to the executor without interpretation. */
export const MODEL_TIERS = ['worker', 'reasoning', 'pro'] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];
