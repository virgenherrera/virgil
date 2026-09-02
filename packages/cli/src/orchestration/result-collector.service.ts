import { Injectable } from '@nestjs/common';
import { createTimestamp } from '../shared/primitives.js';
import type { Timestamp, Ulid } from '../shared/primitives.js';
import { AgentState } from './agent-lifecycle.js';
import type {
  AgentInstance,
  AgentResult,
  RejectionResponse,
} from './agent-instance.js';
import type { TaskEnvelope } from './task-envelope.schema.js';

/** Outcome of validating an agent result against its envelope requirements. */
export interface ResultValidation {
  readonly valid: boolean;
  readonly missingDeliverables: readonly string[];
  readonly missingEvidence: readonly string[];
}

/** Per-agent summary included in the orchestration report. */
export interface AgentSummary {
  readonly name: string;
  readonly role: string;
  readonly state: AgentState;
  readonly result?: AgentResult;
  readonly rejectionReason?: RejectionResponse;
}

/** Synthesized report of an orchestration session's outcomes (H10 D9). */
export interface OrchestrationReport {
  readonly sessionId: Ulid;
  readonly totalDispatched: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly completed: number;
  readonly failed: number;
  readonly verified: number;
  readonly agents: readonly AgentSummary[];
  readonly unresolved: readonly string[];
  readonly timestamp: Timestamp;
}

/**
 * Validates agent results against envelope requirements and synthesizes
 * orchestration reports (H10 D9).
 */
@Injectable()
export class ResultCollectorService {
  /** Checks whether an agent result satisfies its envelope's declared requirements. */
  validateResult(
    envelope: TaskEnvelope,
    result: AgentResult,
  ): ResultValidation {
    const missingDeliverables = envelope.deliverables.filter(
      (d) => !result.deliverables.includes(d),
    );

    const missingEvidence = envelope.evidenceRequired.filter(
      (e) => !result.evidence.includes(e),
    );

    return {
      valid: missingDeliverables.length === 0 && missingEvidence.length === 0,
      missingDeliverables,
      missingEvidence,
    };
  }

  /** Collects results from all agents in a session into a structured report. */
  collectResults(
    sessionId: Ulid,
    agents: readonly AgentInstance[],
  ): OrchestrationReport {
    const summaries: AgentSummary[] = agents.map((agent) => ({
      name: agent.envelope.name,
      role: agent.envelope.role,
      state: agent.state,
      result: agent.result,
      rejectionReason: agent.rejectionReason,
    }));

    const unresolved: string[] = [];
    for (const agent of agents) {
      if (agent.state === AgentState.Failed) {
        unresolved.push(`Agent "${agent.envelope.name}" failed`);
      }
      if (agent.result) {
        const validation = this.validateResult(agent.envelope, agent.result);
        if (!validation.valid) {
          for (const d of validation.missingDeliverables) {
            unresolved.push(
              `Agent "${agent.envelope.name}" missing deliverable: ${d}`,
            );
          }
          for (const e of validation.missingEvidence) {
            unresolved.push(
              `Agent "${agent.envelope.name}" missing evidence: ${e}`,
            );
          }
        }
      }
    }

    return {
      sessionId,
      totalDispatched: agents.filter((a) => a.state !== AgentState.Created)
        .length,
      accepted: agents.filter((a) =>
        [
          AgentState.Accepted,
          AgentState.Executing,
          AgentState.Completed,
          AgentState.RevisionRequested,
          AgentState.Verified,
          AgentState.Failed,
        ].includes(a.state),
      ).length,
      rejected: agents.filter((a) => a.state === AgentState.Rejected).length,
      completed: agents.filter((a) =>
        [AgentState.Completed, AgentState.Verified].includes(a.state),
      ).length,
      failed: agents.filter((a) => a.state === AgentState.Failed).length,
      verified: agents.filter((a) => a.state === AgentState.Verified).length,
      agents: summaries,
      unresolved,
      timestamp: createTimestamp(),
    };
  }
}
