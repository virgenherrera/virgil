import { z } from 'zod';
import { ContentHashSchema, TimestampSchema } from '../shared/primitives.js';

// ---- Crawl configuration ----

/** Configurable limits on discovery expansion. */
export const CrawlConfigSchema = z.object({
  /** Maximum traversal depth for reference chains. */
  maxDepth: z.number().int().positive().default(3),
  /** Maximum total provider queries per discovery cycle. */
  maxQueries: z.number().int().positive().default(20),
  /** Maximum evidence artifacts collected per cycle. */
  maxArtifacts: z.number().int().positive().default(50),
  /** Per-provider query budget. */
  perProviderBudget: z.number().int().positive().default(10),
  /** Minimum relevance score for knowledge coverage assessment. */
  minRelevanceScore: z.number().min(0).max(1).default(0.3),
});

export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;
export type CrawlConfigInput = z.input<typeof CrawlConfigSchema>;

// ---- Discovery intent ----

/** A single element within a discovery intent. */
export const IntentElementSchema = z.object({
  /** Unique key for deduplication and coverage tracking. */
  key: z.string().min(1),
  /** Category of the element. */
  category: z.enum([
    'component',
    'documentation',
    'related-issue',
    'architectural-area',
    'conversation',
  ]),
  /** Human-readable description of what is being sought. */
  description: z.string().min(1),
  /** Raw value extracted from the issue (URL, label, key, path, and similar). */
  value: z.string(),
});

export type IntentElement = z.infer<typeof IntentElementSchema>;

/** Structured discovery intent derived from a resolved issue. */
export const DiscoveryIntentSchema = z.object({
  /** The issue identifier this intent was derived from. */
  issueId: z.string().min(1),
  /** Individual intent elements to discover. */
  elements: z.array(IntentElementSchema),
});

export type DiscoveryIntent = z.infer<typeof DiscoveryIntentSchema>;

// ---- Knowledge coverage ----

/** Coverage level of a single intent element. */
export enum CoverageLevel {
  FULL = 'full',
  PARTIAL = 'partial',
  NONE = 'none',
}

export const CoverageLevelSchema = z.nativeEnum(CoverageLevel);

/** Coverage assessment for a single intent element. */
export const IntentCoverageSchema = z.object({
  /** Key matching the intent element. */
  elementKey: z.string().min(1),
  /** Coverage classification. */
  level: CoverageLevelSchema,
  /** Best relevance score from existing knowledge (0 if none). */
  bestScore: z.number().min(0).max(1),
  /** Number of matching knowledge chunks found. */
  matchCount: z.number().int().nonnegative(),
});

export type IntentCoverage = z.infer<typeof IntentCoverageSchema>;

/** Aggregate known-knowledge result set. */
export const KnowledgeCoverageResultSchema = z.object({
  /** Per-element coverage assessments. */
  coverages: z.array(IntentCoverageSchema),
  /** Element keys with insufficient coverage (the gaps). */
  insufficientKeys: z.array(z.string().min(1)),
});

export type KnowledgeCoverageResult = z.infer<
  typeof KnowledgeCoverageResultSchema
>;

// ---- Gaps ----

/** The category of knowledge a gap represents. */
export enum GapCategory {
  DOCUMENTATION = 'documentation',
  CODE = 'code',
  ISSUE_CONTEXT = 'issue-context',
  CONVERSATION = 'conversation',
  ARCHITECTURAL_CONTEXT = 'architectural-context',
}

export const GapCategorySchema = z.nativeEnum(GapCategory);

/** Priority classification for a gap. */
export enum GapPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export const GapPrioritySchema = z.nativeEnum(GapPriority);

/** A single identified gap in known knowledge. */
export const GapSchema = z.object({
  /** Unique identifier for this gap. */
  id: z.string().min(1),
  /** Keys of the intent elements this gap relates to. */
  intentElementKeys: z.array(z.string().min(1)).min(1),
  /** Category of the missing knowledge. */
  category: GapCategorySchema,
  /** Human-readable description of what is missing. */
  description: z.string().min(1),
  /** Provider capabilities that could fill this gap. */
  providerCapabilities: z.array(z.string().min(1)).min(1),
  /** Estimated priority. */
  priority: GapPrioritySchema,
});

export type Gap = z.infer<typeof GapSchema>;

/** Result of gap analysis. */
export const GapAnalysisResultSchema = z.object({
  /** Identified gaps. */
  gaps: z.array(GapSchema),
  /** Whether all intent elements are fully covered. */
  fullyCovered: z.boolean(),
});

export type GapAnalysisResult = z.infer<typeof GapAnalysisResultSchema>;

// ---- Evidence ----

/** A reference to a piece of collected evidence with provenance. */
export const EvidenceRefSchema = z.object({
  /** Provider identity that supplied this evidence. */
  providerId: z.string().min(1),
  /** Original source URI/path/reference. */
  sourceUri: z.string().min(1),
  /** SHA-256 content hash. */
  contentHash: ContentHashSchema,
  /** When the evidence was discovered. */
  discoveredAt: TimestampSchema,
  /** The originating issue identifier. */
  taskAssociation: z.string().min(1),
  /** Title or label for the evidence. */
  title: z.string(),
  /** MIME type of the content. */
  mimeType: z.string().default('text/plain'),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ---- Unresolved gap ----

/** A gap that could not be resolved, with the reason. */
export const UnresolvedGapSchema = z.object({
  gap: GapSchema,
  reason: z.string().min(1),
});

export type UnresolvedGap = z.infer<typeof UnresolvedGapSchema>;

// ---- Structured discovery output ----

/** RAG query hint for downstream consumers. */
export const QueryHintSchema = z.object({
  text: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export type QueryHint = z.infer<typeof QueryHintSchema>;

/** Resolved issue context carried in the discovery output. */
export const ResolvedIssueContextSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  labels: z.array(z.string()).readonly(),
});

export type ResolvedIssueContext = z.infer<typeof ResolvedIssueContextSchema>;

/** The complete, versioned output of a discovery cycle. */
export const DiscoveryOutputSchema = z.object({
  /** Output format version. */
  version: z.string().min(1),
  /** Resolved issue context. */
  issue: ResolvedIssueContextSchema,
  /** Discovery intent derived from the issue. */
  intent: DiscoveryIntentSchema,
  /** Coverage summary from known knowledge. */
  coverageSummary: KnowledgeCoverageResultSchema,
  /** Evidence references for resolved gaps. */
  resolvedEvidence: z.array(EvidenceRefSchema),
  /** Gaps that remain unresolved with reasons. */
  unresolvedGaps: z.array(UnresolvedGapSchema),
  /** Full provenance trail of all provider queries. */
  provenanceTrail: z.array(
    z.object({
      provider: z.string().min(1),
      query: z.string(),
      timestamp: TimestampSchema,
      resultCount: z.number().int().nonnegative(),
    }),
  ),
  /** Suggested RAG queries for downstream consumers. */
  queryHints: z.array(QueryHintSchema),
  /** Detected circular references. */
  circularReferences: z.array(z.string()),
});

export type DiscoveryOutput = z.infer<typeof DiscoveryOutputSchema>;
