import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { createTimestamp, createUlid } from '../shared/primitives.js';
import type { Ulid } from '../shared/primitives.js';
import {
  HANDOFF_TRANSITIONS,
  HandoffStatus,
  isValidHandoffTransition,
} from '../shared/handoff.types.js';
import { HandoffProtocolEnvelopeSchema } from './handoff-protocol.schema.js';
import type { HandoffProtocolEnvelope } from './handoff-protocol.schema.js';
import {
  HandoffSerializationError,
  HandoffTransitionError,
  HandoffValidationError,
} from './handoff-protocol.errors.js';

/**
 * Pre-transform (schema `input`) shape of a {@link HandoffProtocolEnvelope}.
 * Used to type factory inputs so callers may pass plain, un-branded values
 * (e.g. a raw `number` for a `Timestamp`-typed field) — `create()` validates
 * and brands them via `HandoffProtocolEnvelopeSchema` before returning the
 * typed envelope.
 */
type HandoffProtocolEnvelopeInput = z.input<
  typeof HandoffProtocolEnvelopeSchema
>;

/**
 * Required inputs for {@link HandoffProtocolFactory.create}. Everything the
 * receiving agent must have to act on the handoff — `title`, `source`,
 * `objective`, and `repoTargets` — is mandatory here; every other field is
 * populated progressively via `partial` (H09 D7).
 */
export interface CreateHandoffProtocolEnvelopeInput {
  readonly title: string;
  readonly source: HandoffProtocolEnvelopeInput['source'];
  readonly objective: string;
  readonly repoTargets: HandoffProtocolEnvelopeInput['repoTargets'];
  readonly parentId?: Ulid;
  readonly partial?: Partial<
    Pick<
      HandoffProtocolEnvelopeInput,
      | 'acceptanceCriteria'
      | 'constraints'
      | 'components'
      | 'architecturalContext'
      | 'dependencies'
      | 'risks'
      | 'unresolvedQuestions'
      | 'provenanceRefs'
      | 'ragQueryHints'
      | 'verificationRequirements'
    >
  >;
}

/**
 * NestJS-injectable factory/builder for {@link HandoffProtocolEnvelope}
 * (H09 D7). Constructs envelopes with sensible defaults (auto-generated
 * `id`, `createdAt`/`updatedAt`, initial `HandoffStatus.DRAFT`), validates
 * every constructed or transitioned envelope against
 * `HandoffProtocolEnvelopeSchema`, and hosts the serialization round-trip
 * (D8) and status transition (D2) operations.
 */
@Injectable()
export class HandoffProtocolFactory {
  /**
   * Builds a new draft handoff envelope from required and progressively
   * supplied optional fields, then validates it against
   * `HandoffProtocolEnvelopeSchema`.
   *
   * @throws {HandoffValidationError} if the constructed envelope fails
   *   schema validation (e.g. a credential pattern or an over-length
   *   objective slipped through the caller's input).
   */
  create(input: CreateHandoffProtocolEnvelopeInput): HandoffProtocolEnvelope {
    const now = createTimestamp();

    const candidate = {
      id: createUlid(),
      status: HandoffStatus.DRAFT,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      source: input.source,
      objective: input.objective,
      acceptanceCriteria: input.partial?.acceptanceCriteria ?? [],
      constraints: input.partial?.constraints ?? [],
      repoTargets: input.repoTargets,
      components: input.partial?.components ?? [],
      architecturalContext: input.partial?.architecturalContext ?? [],
      dependencies: input.partial?.dependencies ?? [],
      risks: input.partial?.risks ?? [],
      unresolvedQuestions: input.partial?.unresolvedQuestions ?? [],
      provenanceRefs: input.partial?.provenanceRefs ?? [],
      ragQueryHints: input.partial?.ragQueryHints ?? [],
      verificationRequirements: input.partial?.verificationRequirements ?? {
        evidenceRequired: [],
      },
    };

    return this.validate(candidate);
  }

  /**
   * Validates an arbitrary candidate value against
   * `HandoffProtocolEnvelopeSchema`, returning the typed, defaulted
   * envelope on success.
   *
   * @throws {HandoffValidationError} on any schema violation, including a
   *   detected exclusion pattern (D6).
   */
  validate(candidate: unknown): HandoffProtocolEnvelope {
    const result = HandoffProtocolEnvelopeSchema.safeParse(candidate);
    if (!result.success) {
      throw new HandoffValidationError(
        'Handoff envelope failed schema validation',
        result.error.issues,
      );
    }
    return result.data;
  }

  /**
   * Transitions `envelope` from its current status to `to`, re-stamping
   * `updatedAt` on success (D2).
   *
   * @throws {HandoffTransitionError} if `to` is not a legal edge of the
   *   shared `HANDOFF_TRANSITIONS` FSM from the envelope's current status.
   */
  transition(
    envelope: HandoffProtocolEnvelope,
    to: HandoffStatus,
  ): HandoffProtocolEnvelope {
    if (!isValidHandoffTransition(envelope.status, to)) {
      throw new HandoffTransitionError(
        envelope.status,
        to,
        HANDOFF_TRANSITIONS[envelope.status],
      );
    }

    return this.validate({
      ...envelope,
      status: to,
      updatedAt: createTimestamp(),
    });
  }

  /** Serializes `envelope` to a JSON string (D8). */
  serialize(envelope: HandoffProtocolEnvelope): string {
    return JSON.stringify(envelope);
  }

  /**
   * Parses `json`, validating the result against
   * `HandoffProtocolEnvelopeSchema` (D8).
   *
   * @throws {HandoffSerializationError} if `json` is not valid JSON.
   * @throws {HandoffValidationError} if the parsed value does not satisfy
   *   the handoff envelope schema.
   */
  deserialize(json: string): HandoffProtocolEnvelope {
    let candidate: unknown;
    try {
      candidate = JSON.parse(json);
    } catch (cause) {
      throw new HandoffSerializationError(
        'Handoff envelope payload is not valid JSON',
        { cause },
      );
    }

    return this.validate(candidate);
  }
}
