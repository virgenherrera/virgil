import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ExtractionError } from '../errors/cdp-errors.js';

export const NormalizedArtifactSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  provenance: z.object({
    targetApp: z.string(),
    url: z.string(),
    pomVersion: z.string(),
  }),
  contentHash: z
    .string()
    .regex(
      /^[a-f0-9]{64}$/,
      'contentHash must be a lowercase SHA-256 hex digest',
    ),
  extractedAt: z.iso.datetime(),
  metadata: z.object({
    browser: z.string(),
    profilePath: z.string(),
    durationMs: z.number().nonnegative(),
  }),
});

/** Provider-neutral normalized output of a POM extraction, ready for knowledge persistence. */
export type NormalizedArtifact = z.infer<typeof NormalizedArtifactSchema>;

export interface BuildNormalizedArtifactInput {
  readonly content: Record<string, unknown>;
  readonly targetApp: string;
  readonly url: string;
  readonly pomVersion: string;
  readonly browser: string;
  readonly profilePath: string;
  readonly durationMs: number;
  /** Overrides the extraction timestamp; defaults to `now`. Intended for deterministic tests. */
  readonly extractedAt?: Date;
}

/**
 * Builds and validates a {@link NormalizedArtifact} from raw extraction output.
 *
 * @throws {ExtractionError} when the assembled artifact fails schema validation.
 */
export function buildNormalizedArtifact(
  input: BuildNormalizedArtifactInput,
): NormalizedArtifact {
  const contentHash = createHash('sha256')
    .update(JSON.stringify(input.content))
    .digest('hex');

  const candidate = {
    content: input.content,
    provenance: {
      targetApp: input.targetApp,
      url: input.url,
      pomVersion: input.pomVersion,
    },
    contentHash,
    extractedAt: (input.extractedAt ?? new Date()).toISOString(),
    metadata: {
      browser: input.browser,
      profilePath: input.profilePath,
      durationMs: input.durationMs,
    },
  };

  const result = NormalizedArtifactSchema.safeParse(candidate);

  if (!result.success) {
    throw new ExtractionError('Failed to build a valid normalized artifact.', {
      issues: result.error.issues,
    });
  }

  return result.data;
}
