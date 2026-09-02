import { z } from 'zod';

/**
 * Version identifiers follow `<target>[-<variant>]-v<major>`, e.g.
 * `jira-cloud-v1` or, when no deployment variant applies, `monday-v1`.
 */
export const POM_VERSION_PATTERN = /^[a-z0-9]+-(?:[a-z0-9]+-)?v(\d+)$/;

export const PomVersionSchema = z
  .string()
  .regex(
    POM_VERSION_PATTERN,
    'POM version must match "<target>[-<variant>]-v<major>"',
  );

const GotoStepSchema = z.object({
  type: z.literal('goto'),
  url: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
});

const ClickStepSchema = z.object({
  type: z.literal('click'),
  selector: z.string().min(1),
  required: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
});

const FillStepSchema = z.object({
  type: z.literal('fill'),
  selector: z.string().min(1),
  value: z.string(),
  timeoutMs: z.number().int().positive().optional(),
});

const SelectStepSchema = z.object({
  type: z.literal('select'),
  selector: z.string().min(1),
  value: z.string(),
  timeoutMs: z.number().int().positive().optional(),
});

const WaitStepSchema = z.object({
  type: z.literal('wait'),
  condition: z.enum(['selector-visible', 'network-idle', 'timeout']),
  selector: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().default(30_000),
});

export const NavigationStepSchema = z.discriminatedUnion('type', [
  GotoStepSchema,
  ClickStepSchema,
  FillStepSchema,
  SelectStepSchema,
  WaitStepSchema,
]);

export type NavigationStep = z.infer<typeof NavigationStepSchema>;

export const ExtractionStepSchema = z.object({
  /** Output field name this extraction step populates. */
  field: z.string().min(1),
  selector: z.string().min(1),
  selectorType: z.enum(['css', 'xpath']).default('css'),
  /** DOM attribute to read; omitted reads normalized text content. */
  attribute: z.string().optional(),
  /** Anchor selectors are smoke-tested before extraction begins. */
  required: z.boolean().default(false),
  /** Whether to collect every match instead of the first. */
  multiple: z.boolean().default(false),
});

export type ExtractionStep = z.infer<typeof ExtractionStepSchema>;

export const OutputFieldSpecSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean().default(false),
});

export type OutputFieldSpec = z.infer<typeof OutputFieldSpecSchema>;

export const PomMetadataSchema = z
  .object({
    knownFragility: z.string().optional(),
    maintenanceCadence: z.string().optional(),
  })
  .optional();

export const PomDefinitionSchema = z.object({
  targetApp: z.string().min(1),
  version: PomVersionSchema,
  description: z.string().optional(),
  navigationSteps: z.array(NavigationStepSchema).min(1),
  extractionSteps: z.array(ExtractionStepSchema).min(1),
  outputShape: z.record(z.string(), OutputFieldSpecSchema),
  metadata: PomMetadataSchema,
});

export type PomDefinition = z.infer<typeof PomDefinitionSchema>;

/**
 * Builds a Zod object schema from a POM's declared `outputShape`, used to
 * validate extraction results after a POM executes.
 */
export function buildOutputShapeSchema(
  outputShape: PomDefinition['outputShape'],
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};

  for (const [field, spec] of Object.entries(outputShape)) {
    let fieldSchema: z.ZodType;

    switch (spec.type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'array':
        fieldSchema = z.array(z.unknown());
        break;
      case 'object':
        fieldSchema = z.record(z.string(), z.unknown());
        break;
    }

    shape[field] = spec.required ? fieldSchema : fieldSchema.optional();
  }

  return z.object(shape);
}

/** Extracts the numeric major version from a validated POM version string. */
export function parsePomVersionMajor(version: string): number {
  const match = POM_VERSION_PATTERN.exec(version);

  if (!match) {
    throw new Error(`Invalid POM version format: ${version}`);
  }

  return Number.parseInt(match[1] as string, 10);
}
