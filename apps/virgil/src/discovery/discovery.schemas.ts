import { z } from 'zod';
import { ContentHashSchema, TimestampSchema } from '../shared/primitives.js';

export const CrawlConfigSchema = z.object({
  maxDepth: z.number().int().positive().default(3),
  maxQueries: z.number().int().positive().default(20),
  maxArtifacts: z.number().int().positive().default(50),
  perProviderBudget: z.number().int().positive().default(10),
  minRelevanceScore: z.number().min(0).max(1).default(0.3),
});

export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;
export type CrawlConfigInput = z.input<typeof CrawlConfigSchema>;

export const IntentElementSchema = z.object({
  key: z.string().min(1),
  category: z.enum(['component', 'documentation', 'related-issue', 'architectural-area', 'conversation']),
  description: z.string().min(1),
  value: z.string(),
});

export type IntentElement = z.infer<typeof IntentElementSchema>;

export const DiscoveryIntentSchema = z.object({
  issueId: z.string().min(1),
  elements: z.array(IntentElementSchema),
});

export type DiscoveryIntent = z.infer<typeof DiscoveryIntentSchema>;

export enum CoverageLevel { FULL = 'full', PARTIAL = 'partial', NONE = 'none' }
export const CoverageLevelSchema = z.nativeEnum(CoverageLevel);

export const IntentCoverageSchema = z.object({
  elementKey: z.string().min(1),
  level: CoverageLevelSchema,
  bestScore: z.number().min(0).max(1),
  matchCount: z.number().int().nonnegative(),
});

export type IntentCoverage = z.infer<typeof IntentCoverageSchema>;

export const KnowledgeCoverageResultSchema = z.object({
  coverages: z.array(IntentCoverageSchema),
  insufficientKeys: z.array(z.string().min(1)),
});

export type KnowledgeCoverageResult = z.infer<typeof KnowledgeCoverageResultSchema>;

export enum GapCategory { DOCUMENTATION = 'documentation', CODE = 'code', ISSUE_CONTEXT = 'issue-context', CONVERSATION = 'conversation', ARCHITECTURAL_CONTEXT = 'architectural-context' }
export const GapCategorySchema = z.nativeEnum(GapCategory);

export enum GapPriority { HIGH = 'high', MEDIUM = 'medium', LOW = 'low' }
export const GapPrioritySchema = z.nativeEnum(GapPriority);

export const GapSchema = z.object({
  id: z.string().min(1),
  intentElementKeys: z.array(z.string().min(1)).min(1),
  category: GapCategorySchema,
  description: z.string().min(1),
  providerCapabilities: z.array(z.string().min(1)).min(1),
  priority: GapPrioritySchema,
});

export type Gap = z.infer<typeof GapSchema>;

export const GapAnalysisResultSchema = z.object({
  gaps: z.array(GapSchema),
  fullyCovered: z.boolean(),
});

export type GapAnalysisResult = z.infer<typeof GapAnalysisResultSchema>;

export const EvidenceRefSchema = z.object({
  providerId: z.string().min(1),
  sourceUri: z.string().min(1),
  contentHash: ContentHashSchema,
  discoveredAt: TimestampSchema,
  taskAssociation: z.string().min(1),
  title: z.string(),
  mimeType: z.string().default('text/plain'),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const UnresolvedGapSchema = z.object({
  gap: GapSchema,
  reason: z.string().min(1),
});

export type UnresolvedGap = z.infer<typeof UnresolvedGapSchema>;

export const QueryHintSchema = z.object({
  text: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export type QueryHint = z.infer<typeof QueryHintSchema>;

export const ResolvedIssueContextSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  labels: z.array(z.string()).readonly(),
});

export type ResolvedIssueContext = z.infer<typeof ResolvedIssueContextSchema>;

export const DiscoveryOutputSchema = z.object({
  version: z.string().min(1),
  issue: ResolvedIssueContextSchema,
  intent: DiscoveryIntentSchema,
  coverageSummary: KnowledgeCoverageResultSchema,
  resolvedEvidence: z.array(EvidenceRefSchema),
  unresolvedGaps: z.array(UnresolvedGapSchema),
  provenanceTrail: z.array(z.object({
    provider: z.string().min(1),
    query: z.string(),
    timestamp: TimestampSchema,
    resultCount: z.number().int().nonnegative(),
  })),
  queryHints: z.array(QueryHintSchema),
  circularReferences: z.array(z.string()),
});

export type DiscoveryOutput = z.infer<typeof DiscoveryOutputSchema>;
