import { Injectable } from '@nestjs/common';
import { createTimestamp, createUlid } from '../shared/primitives.js';
import type { Ulid } from '../shared/primitives.js';
import { AgentState, assertValidAgentTransition } from './agent-lifecycle.js';
import type { TransitionRecord } from './agent-lifecycle.js';
import { TaskEnvelopeSchema } from './task-envelope.schema.js';
import type { TaskEnvelopeInput } from './task-envelope.schema.js';
import type {
  AgentInstance,
  AgentResult,
  RejectionResponse,
} from './agent-instance.js';
import { RejectionResponseSchema } from './agent-instance.js';
import {
  DuplicateAgentError,
  TaskEnvelopeValidationError,
} from './orchestration.errors.js';

/**
 * Creates and manages agent instances within orchestration sessions (H10 D2, D3).
 * Each agent is created from a validated task envelope and tracked through the
 * deterministic lifecycle FSM.
 */
@Injectable()
export class AgentFactory {
  private readonly sessions = new Map<string, Map<string, AgentInstance>>();

  /** Creates a new orchestration session, returning its unique identifier. */
  createSession(): Ulid {
    const sessionId = createUlid();
    this.sessions.set(sessionId, new Map());
    return sessionId;
  }

  /**
   * Creates an agent from a validated task envelope within a session.
   * @throws {TaskEnvelopeValidationError} if the envelope is invalid.
   * @throws {DuplicateAgentError} if the name already exists in the session.
   */
  create(sessionId: Ulid, input: TaskEnvelopeInput): AgentInstance {
    const parseResult = TaskEnvelopeSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TaskEnvelopeValidationError(
        'Task envelope failed schema validation',
        parseResult.error.issues,
      );
    }

    const envelope = parseResult.data;
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} does not exist`);
    }

    if (session.has(envelope.name)) {
      throw new DuplicateAgentError(envelope.name, sessionId);
    }

    const now = createTimestamp();
    const instance: AgentInstance = {
      id: createUlid(),
      sessionId,
      envelope,
      state: AgentState.Created,
      transitions: [],
      createdAt: now,
    };

    session.set(envelope.name, instance);
    return instance;
  }

  /** Retrieves an agent by name within a session. */
  getAgent(sessionId: Ulid, agentName: string): AgentInstance | undefined {
    return this.sessions.get(sessionId)?.get(agentName);
  }

  /** Returns all agents in a session as an array. */
  getSessionAgents(sessionId: Ulid): readonly AgentInstance[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.values()] : [];
  }

  /**
   * Advances an agent through the lifecycle FSM, recording the transition.
   * @throws {AgentLifecycleError} if the transition is not legal.
   */
  transition(
    sessionId: Ulid,
    agentName: string,
    to: AgentState,
    event: string,
  ): AgentInstance {
    const agent = this.requireAgent(sessionId, agentName);
    assertValidAgentTransition(agent.state, to);

    const record: TransitionRecord = {
      from: agent.state,
      to,
      timestamp: createTimestamp(),
      event,
    };

    const updated: AgentInstance = {
      ...agent,
      state: to,
      transitions: [...agent.transitions, record],
    };

    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  /** Dispatches an agent (Created -> Dispatched). */
  dispatch(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(
      sessionId,
      agentName,
      AgentState.Dispatched,
      'dispatch',
    );
  }

  /** Records acceptance of an assignment (Dispatched -> Accepted). */
  accept(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Accepted, 'accept');
  }

  /**
   * Records rejection with a structured reason (Dispatched -> Rejected).
   * @throws {TaskEnvelopeValidationError} if the rejection response is invalid.
   */
  reject(
    sessionId: Ulid,
    agentName: string,
    rejection: RejectionResponse,
  ): AgentInstance {
    const parseResult = RejectionResponseSchema.safeParse(rejection);
    if (!parseResult.success) {
      throw new TaskEnvelopeValidationError(
        'Rejection response failed validation',
        parseResult.error.issues,
      );
    }

    const agent = this.transition(
      sessionId,
      agentName,
      AgentState.Rejected,
      'reject',
    );

    const updated: AgentInstance = {
      ...agent,
      rejectionReason: parseResult.data,
    };
    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  /** Begins material work (Accepted -> Executing). */
  beginExecution(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(
      sessionId,
      agentName,
      AgentState.Executing,
      'begin_execution',
    );
  }

  /** Records completion with a structured result (Executing -> Completed). */
  complete(
    sessionId: Ulid,
    agentName: string,
    result: AgentResult,
  ): AgentInstance {
    const agent = this.transition(
      sessionId,
      agentName,
      AgentState.Completed,
      'complete',
    );

    const updated: AgentInstance = { ...agent, result };
    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  /** Records failure (Executing -> Failed). */
  fail(sessionId: Ulid, agentName: string, reason: string): AgentInstance {
    return this.transition(
      sessionId,
      agentName,
      AgentState.Failed,
      `fail: ${reason}`,
    );
  }

  /** Marks an agent as verified (Completed -> Verified). */
  verify(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Verified, 'verify');
  }

  /** Requests revision with feedback (Completed -> RevisionRequested). */
  requestRevision(
    sessionId: Ulid,
    agentName: string,
    feedback: string,
  ): AgentInstance {
    return this.transition(
      sessionId,
      agentName,
      AgentState.RevisionRequested,
      `revision_requested: ${feedback}`,
    );
  }

  /** Resumes execution after revision (RevisionRequested -> Executing). */
  resumeExecution(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(
      sessionId,
      agentName,
      AgentState.Executing,
      'resume_execution',
    );
  }

  private requireAgent(sessionId: Ulid, agentName: string): AgentInstance {
    const agent = this.getAgent(sessionId, agentName);
    if (!agent) {
      throw new Error(`Agent "${agentName}" not found in session ${sessionId}`);
    }
    return agent;
  }
}
