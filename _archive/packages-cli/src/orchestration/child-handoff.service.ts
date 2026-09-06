import { Injectable } from '@nestjs/common';
import type { Ulid } from '../shared/primitives.js';
import { ProviderCapability } from '../shared/provider.types.js';
import { HandoffDependencyType } from '../handoff/handoff-protocol.schema.js';
import type { HandoffProtocolEnvelope } from '../handoff/handoff-protocol.schema.js';
import { HandoffProtocolFactory } from '../handoff/handoff-protocol.service.js';

/** Input for generating a child handoff envelope from orchestration context (H10 D8). */
export interface ChildHandoffInput {
  readonly taskName: string;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly constraints: readonly string[];
  readonly components: readonly { path: string; description?: string }[];
  readonly ragQueryHints: readonly { query: string; relevanceNote?: string }[];
  readonly dependencies: readonly {
    type: string;
    id: string;
    description: string;
  }[];
  readonly risks: readonly { description: string; mitigation?: string }[];
  readonly unresolvedQuestions: readonly string[];
  readonly evidenceRequired: readonly string[];
  readonly repoTargets: {
    workspaceId: string;
    packages: string[];
    branch?: string;
  };
  readonly source: {
    providerType: ProviderCapability;
    providerId: string;
    sourceRef: string;
    sourceUrl?: string;
  };
  readonly parentId?: Ulid;
}

/**
 * Generates H09-conformant handoff envelopes from orchestration synthesis
 * output (H10 D8). Delegates to {@link HandoffProtocolFactory} for
 * construction and validation.
 */
@Injectable()
export class ChildHandoffService {
  constructor(private readonly handoffFactory: HandoffProtocolFactory) {}

  /** Produces a validated H09 handoff envelope from orchestration context. */
  generate(input: ChildHandoffInput): HandoffProtocolEnvelope {
    return this.handoffFactory.create({
      title: input.taskName,
      source: input.source,
      objective: input.objective,
      repoTargets: input.repoTargets,
      parentId: input.parentId,
      partial: {
        acceptanceCriteria: input.acceptanceCriteria.map((desc, i) => ({
          id: `ac-${i + 1}`,
          description: desc,
        })),
        constraints: input.constraints.slice(),
        components: input.components.map((c) => ({
          path: c.path,
          ...(c.description ? { description: c.description } : {}),
        })),
        ragQueryHints: input.ragQueryHints.map((h) => ({
          query: h.query,
          ...(h.relevanceNote ? { relevanceNote: h.relevanceNote } : {}),
        })),
        dependencies: input.dependencies.map((d) => ({
          type: this.mapDependencyType(d.type),
          id: d.id,
          description: d.description,
        })),
        risks: input.risks.map((r) => ({
          description: r.description,
          ...(r.mitigation ? { mitigation: r.mitigation } : {}),
        })),
        unresolvedQuestions: input.unresolvedQuestions.slice(),
        verificationRequirements: {
          evidenceRequired: input.evidenceRequired.slice(),
        },
      },
    });
  }

  private mapDependencyType(type: string): HandoffDependencyType {
    if (
      Object.values(HandoffDependencyType).includes(
        type as HandoffDependencyType,
      )
    ) {
      return type as HandoffDependencyType;
    }
    return HandoffDependencyType.EXTERNAL;
  }
}
