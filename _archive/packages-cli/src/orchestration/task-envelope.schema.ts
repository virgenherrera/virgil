import { z } from 'zod';

/** Typed reference to an input the agent receives at dispatch time. */
export const TaskInputRefSchema = z
  .object({
    type: z.string().min(1),
    ref: z.string().min(1),
    description: z.string().min(1).optional(),
  })
  .strict();

export type TaskInputRef = z.infer<typeof TaskInputRefSchema>;

/**
 * Zod-validated schema for agent assignment envelopes (H10 D1).
 *
 * Every field the orchestrator needs to fully specify an agent assignment:
 * identity, role, objective, scope boundaries, inputs, expected deliverables,
 * acceptance criteria, evidence requirements, constraints, model tier, and
 * dependency edges to other agents in the same session.
 */
export const TaskEnvelopeSchema = z
  .object({
    name: z.string().min(1).max(128),
    role: z.string().min(1).max(128),
    persona: z.string().min(1).max(256).optional(),
    objective: z.string().min(1).max(4096),
    scope: z.array(z.string().min(1)),
    outOfScope: z.array(z.string().min(1)).default([]),
    inputs: z.array(TaskInputRefSchema).default([]),
    deliverables: z.array(z.string().min(1)),
    acceptanceCriteria: z.array(z.string().min(1)),
    evidenceRequired: z.array(z.string().min(1)).default([]),
    constraints: z.array(z.string().min(1)).default([]),
    tier: z.enum(['worker', 'reasoning', 'pro']),
    dependencies: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>;

export type TaskEnvelopeInput = z.input<typeof TaskEnvelopeSchema>;
