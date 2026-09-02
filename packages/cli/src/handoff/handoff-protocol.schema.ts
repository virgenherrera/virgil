import { z } from 'zod';
import type { ContentHash, Timestamp, Ulid } from '../shared/primitives.js';
import {
  ContentHashSchema,
  TimestampSchema,
  UlidSchema,
} from '../shared/primitives.js';
import type { HandoffEnvelope } from '../shared/handoff.types.js';
import {
  HandoffEnvelopeSchema,
  HandoffStatus,
} from '../shared/handoff.types.js';
import { ProviderCapability } from '../shared/provider.types.js';
import {
  DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH,
  DEFAULT_OBJECTIVE_MAX_LENGTH,
  matchesCredentialPattern,
} from './handoff-protocol.constants.js';

/**
 * H09 Handoff Protocol — the machine-readable, Zod-validated envelope that
 * Virgil uses to transfer structured execution context between agent
 * phases (Discovery/Orchestrator -> Implementation Agent -> Verification
 * Agent).
 *
 * This module extends the foundation `HandoffEnvelope`/`HandoffEnvelopeSchema`
 * and `HandoffStatus`/`HANDOFF_TRANSITIONS` FSM defined in
 * `src/shared/handoff.types.ts`; it does not redefine or replace them.
 *
 * A note on status vocabulary: the seed's Handoff Protocol section describes
 * lifecycle names (`draft`, `ready`, `assigned`, `in-progress`,
 * `awaiting-verification`, `verified`, `rejected`) that this module maps
 * onto the already-established shared `HandoffStatus` FSM rather than
 * duplicating it with a second, parallel state machine:
 *
 * | Seed vocabulary          | Shared `HandoffStatus`     |
 * | ------------------------- | --------------------------- |
 * | `draft`                   | `HandoffStatus.DRAFT`       |
 * | `ready`                    | `HandoffStatus.READY`       |
 * | `assigned`                | `HandoffStatus.ASSIGNED`    |
 * | `in-progress`              | `HandoffStatus.IN_PROGRESS` |
 * | `awaiting-verification`    | `HandoffStatus.REVIEW`      |
 * | `verified`                 | `HandoffStatus.DONE`        |
 * | `rejected` (-> in-progress) | folded into the legal `REVIEW -> IN_PROGRESS` edge already present in `HANDOFF_TRANSITIONS` |
 *
 * `HandoffStatus.BLOCKED` and `HandoffStatus.ARCHIVED` remain available as
 * shared-FSM states this protocol does not restrict.
 */

// ---------------------------------------------------------------------------
// D3 — Provenance Reference Schema
// ---------------------------------------------------------------------------

/**
 * Typed reference to a piece of source evidence a handoff was built from.
 * Carries enough to re-locate and freshness-check the source without
 * duplicating its content into the envelope (H09 D3).
 */
export const ProvenanceRefSchema = z
  .object({
    provider: z.nativeEnum(ProviderCapability),
    sourceId: z.string().min(1, { error: 'Source id must not be empty' }),
    uri: z.string().min(1).optional(),
    contentHash: ContentHashSchema.optional(),
    version: z.string().min(1).optional(),
    discoveredAt: TimestampSchema,
    refreshedAt: TimestampSchema.optional(),
    taskAssociations: z.array(UlidSchema).optional(),
  })
  .strict();

export type ProvenanceRef = z.infer<typeof ProvenanceRefSchema>;

// ---------------------------------------------------------------------------
// D4 — RAG Query Hints Schema
// ---------------------------------------------------------------------------

/**
 * Advisory hint suggesting a query the receiving agent may run against
 * Virgil's shared RAG/knowledge store. Hints guide retrieval; they never
 * mandate it (H09 D4).
 */
export const RagQueryHintSchema = z
  .object({
    query: z.string().min(1, { error: 'Query must not be empty' }),
    topicKeys: z.array(z.string().min(1)).optional(),
    providers: z.array(z.nativeEnum(ProviderCapability)).optional(),
    maxResults: z.number().int().positive().optional(),
    relevanceNote: z.string().min(1).optional(),
  })
  .strict();

export type RagQueryHint = z.infer<typeof RagQueryHintSchema>;

// ---------------------------------------------------------------------------
// D5 — Verification Requirements Schema
// ---------------------------------------------------------------------------

/** Optional coverage percentage thresholds (0-100) per metric. */
export const CoverageThresholdSchema = z
  .object({
    statements: z.number().min(0).max(100).optional(),
    lines: z.number().min(0).max(100).optional(),
    functions: z.number().min(0).max(100).optional(),
    branches: z.number().min(0).max(100).optional(),
  })
  .strict();

export type CoverageThreshold = z.infer<typeof CoverageThresholdSchema>;

/**
 * Machine-readable verification expectations a Verification Agent checks a
 * completed handoff against (H09 D5).
 */
export const VerificationRequirementsSchema = z
  .object({
    staticGates: z.array(z.string().min(1)).optional(),
    dynamicGates: z.array(z.string().min(1)).optional(),
    coverageThreshold: CoverageThresholdSchema.optional(),
    specificAssertions: z.array(z.string().min(1)).optional(),
    evidenceRequired: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type VerificationRequirements = z.infer<
  typeof VerificationRequirementsSchema
>;

// ---------------------------------------------------------------------------
// Supporting nested schemas (D1)
// ---------------------------------------------------------------------------

export const HandoffSourceSchema = z
  .object({
    providerType: z.nativeEnum(ProviderCapability),
    providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
    sourceRef: z.string().min(1, { error: 'Source ref must not be empty' }),
    sourceUrl: z.url().optional(),
  })
  .strict();

export type HandoffSource = z.infer<typeof HandoffSourceSchema>;

export const AcceptanceCriterionSchema = z
  .object({
    id: z
      .string()
      .min(1, { error: 'Acceptance criterion id must not be empty' }),
    description: z
      .string()
      .min(1, { error: 'Acceptance criterion description must not be empty' })
      .max(DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH, {
        error: `Acceptance criterion description must not exceed ${DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH} characters`,
      }),
    verified: z.boolean().default(false),
  })
  .strict();

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const RepoTargetsSchema = z
  .object({
    workspaceId: z.string().min(1, { error: 'Workspace id must not be empty' }),
    packages: z.array(z.string().min(1)),
    branch: z.string().min(1).optional(),
  })
  .strict();

export type RepoTargets = z.infer<typeof RepoTargetsSchema>;

export const ComponentRefSchema = z
  .object({
    path: z.string().min(1, { error: 'Component path must not be empty' }),
    description: z.string().min(1).optional(),
  })
  .strict();

export type ComponentRef = z.infer<typeof ComponentRefSchema>;

export const ArchitecturalContextEntrySchema = z
  .object({
    domain: z.string().min(1, { error: 'Domain must not be empty' }),
    description: z.string().min(1, { error: 'Description must not be empty' }),
    references: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ArchitecturalContextEntry = z.infer<
  typeof ArchitecturalContextEntrySchema
>;

/** Kinds of prerequisite a handoff may declare a dependency on. */
export enum HandoffDependencyType {
  HANDOFF = 'handoff',
  DELIVERABLE = 'deliverable',
  EXTERNAL = 'external',
}

export const HandoffDependencySchema = z
  .object({
    type: z.nativeEnum(HandoffDependencyType),
    id: z.string().min(1, { error: 'Dependency id must not be empty' }),
    description: z
      .string()
      .min(1, { error: 'Dependency description must not be empty' }),
  })
  .strict();

export type HandoffDependency = z.infer<typeof HandoffDependencySchema>;

export const HandoffRiskSchema = z
  .object({
    description: z
      .string()
      .min(1, { error: 'Risk description must not be empty' }),
    mitigation: z.string().min(1).optional(),
  })
  .strict();

export type HandoffRisk = z.infer<typeof HandoffRiskSchema>;

// ---------------------------------------------------------------------------
// D6 — Exclusion validation
// ---------------------------------------------------------------------------

/**
 * One structural exclusion violation found while scanning a parsed handoff
 * envelope (H09 D6). `path` is the Zod-issue-compatible field path.
 */
export interface ExclusionViolation {
  readonly path: readonly (string | number)[];
  readonly reason: string;
}

/**
 * Recursively walks every string leaf of a parsed handoff envelope and
 * flags values matching a known credential pattern (D6: "Any string field
 * matches common credential patterns"). Raw chat history, full crawled
 * output, and unprocessed document content are excluded structurally by the
 * strict schema itself (no catch-all/`additionalProperties` field exists for
 * such content to occupy) rather than by this scan.
 */
export function findExcludedContent(
  value: unknown,
  path: readonly (string | number)[] = [],
): ExclusionViolation[] {
  if (typeof value === 'string') {
    return matchesCredentialPattern(value)
      ? [
          {
            path,
            reason:
              'Value matches a known credential pattern (API key, token, password, or embedded-credential connection string) and must not be included in a handoff envelope',
          },
        ]
      : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findExcludedContent(entry, [...path, index]),
    );
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      findExcludedContent(entry, [...path, key]),
    );
  }

  return [];
}

// ---------------------------------------------------------------------------
// D1 — Handoff Envelope Zod Schema
// ---------------------------------------------------------------------------

/**
 * Base fields shared with the foundation `HandoffEnvelopeSchema`
 * (`src/shared/handoff.types.ts`), redeclared here so the protocol schema
 * can be a single flat `.strict()` object (Zod's `.extend()` keeps the
 * base's own strictness, and this module needs its own combined
 * `superRefine` for exclusion validation across every field at once).
 */
const HandoffProtocolBaseShape = {
  id: UlidSchema,
  status: z.nativeEnum(HandoffStatus),
  title: z
    .string()
    .min(1, { error: 'Title must not be empty' })
    .max(200, { error: 'Title must not exceed 200 characters' }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  parentId: UlidSchema.optional(),
};

export const HandoffProtocolEnvelopeSchema = z
  .object({
    ...HandoffProtocolBaseShape,
    source: HandoffSourceSchema,
    objective: z
      .string()
      .min(1, { error: 'Objective must not be empty' })
      .max(DEFAULT_OBJECTIVE_MAX_LENGTH, {
        error: `Objective must not exceed ${DEFAULT_OBJECTIVE_MAX_LENGTH} characters`,
      }),
    acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
    constraints: z.array(z.string().min(1)).default([]),
    repoTargets: RepoTargetsSchema,
    components: z.array(ComponentRefSchema).default([]),
    architecturalContext: z.array(ArchitecturalContextEntrySchema).default([]),
    dependencies: z.array(HandoffDependencySchema).default([]),
    risks: z.array(HandoffRiskSchema).default([]),
    unresolvedQuestions: z.array(z.string().min(1)).default([]),
    provenanceRefs: z.array(ProvenanceRefSchema).default([]),
    ragQueryHints: z.array(RagQueryHintSchema).default([]),
    verificationRequirements: VerificationRequirementsSchema,
  })
  .strict()
  .superRefine((envelope, ctx) => {
    for (const violation of findExcludedContent(envelope)) {
      ctx.addIssue({
        code: 'custom',
        path: [...violation.path],
        message: violation.reason,
      });
    }
  });

export type HandoffProtocolEnvelope = z.infer<
  typeof HandoffProtocolEnvelopeSchema
>;

/**
 * Structural, compile-time proof that {@link HandoffProtocolEnvelope}
 * extends the foundation {@link HandoffEnvelope}: every field required by
 * the base type is present with a compatible type on the protocol
 * envelope. Resolves to `true`; would fail to compile as `never` otherwise.
 */
export type AssertHandoffProtocolEnvelopeExtendsBase =
  HandoffProtocolEnvelope extends HandoffEnvelope ? true : never;

/** Re-exported so consumers of this module never need to reach into `shared/` directly. */
export { HandoffEnvelopeSchema, HandoffStatus };
export type { ContentHash, Timestamp, Ulid };
