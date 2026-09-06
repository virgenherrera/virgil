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

type HandoffProtocolEnvelopeInput = z.input<
  typeof HandoffProtocolEnvelopeSchema
>;

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

@Injectable()
export class HandoffProtocolFactory {
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

  serialize(envelope: HandoffProtocolEnvelope): string {
    return JSON.stringify(envelope);
  }

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
