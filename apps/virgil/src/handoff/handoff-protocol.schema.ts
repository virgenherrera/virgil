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

export const CoverageThresholdSchema = z
  .object({
    statements: z.number().min(0).max(100).optional(),
    lines: z.number().min(0).max(100).optional(),
    functions: z.number().min(0).max(100).optional(),
    branches: z.number().min(0).max(100).optional(),
  })
  .strict();

export type CoverageThreshold = z.infer<typeof CoverageThresholdSchema>;

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

export interface ExclusionViolation {
  readonly path: readonly (string | number)[];
  readonly reason: string;
}

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

export type AssertHandoffProtocolEnvelopeExtendsBase =
  HandoffProtocolEnvelope extends HandoffEnvelope ? true : never;

export { HandoffEnvelopeSchema, HandoffStatus };
export type { ContentHash, Timestamp, Ulid };
