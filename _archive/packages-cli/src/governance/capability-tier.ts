/**
 * Vendor-neutral capability tiers for agent execution governance (H11 D1).
 *
 * - `Worker`: mechanical, search, and extraction tasks.
 * - `Reasoning`: synthesis, review, and architecture tasks.
 * - `Pro`: highest tier; NEVER assigned directly — requires human-gated escalation.
 */
export enum CapabilityTier {
  Worker = 'worker',
  Reasoning = 'reasoning',
  Pro = 'pro',
}
