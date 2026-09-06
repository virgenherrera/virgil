import { Injectable } from '@nestjs/common';
import { createTimestamp, createUlid } from '../shared/primitives.js';
import type { Ulid } from '../shared/primitives.js';
import { AgentState, assertValidAgentTransition } from './agent-lifecycle.js';
import type { TransitionRecord } from './agent-lifecycle.js';
import { TaskEnvelopeSchema } from './task-envelope.schema.js';
import type { TaskEnvelopeInput } from './task-envelope.schema.js';
import type { AgentInstance, AgentResult, RejectionResponse } from './agent-instance.js';
import { RejectionResponseSchema } from './agent-instance.js';
import { DuplicateAgentError, TaskEnvelopeValidationError } from './orchestration.errors.js';

@Injectable()
export class AgentFactory {
  private readonly sessions = new Map<string, Map<string, AgentInstance>>();

  createSession(): Ulid {
    const sessionId = createUlid();
    this.sessions.set(sessionId, new Map());
    return sessionId;
  }

  create(sessionId: Ulid, input: TaskEnvelopeInput): AgentInstance {
    const parseResult = TaskEnvelopeSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TaskEnvelopeValidationError('Task envelope failed schema validation', parseResult.error.issues);
    }
    const envelope = parseResult.data;
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} does not exist`);
    if (session.has(envelope.name)) throw new DuplicateAgentError(envelope.name, sessionId);

    const now = createTimestamp();
    const instance: AgentInstance = {
      id: createUlid(), sessionId, envelope, state: AgentState.Created, transitions: [], createdAt: now,
    };
    session.set(envelope.name, instance);
    return instance;
  }

  getAgent(sessionId: Ulid, agentName: string): AgentInstance | undefined {
    return this.sessions.get(sessionId)?.get(agentName);
  }

  getSessionAgents(sessionId: Ulid): readonly AgentInstance[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.values()] : [];
  }

  transition(sessionId: Ulid, agentName: string, to: AgentState, event: string): AgentInstance {
    const agent = this.requireAgent(sessionId, agentName);
    assertValidAgentTransition(agent.state, to);
    const record: TransitionRecord = { from: agent.state, to, timestamp: createTimestamp(), event };
    const updated: AgentInstance = { ...agent, state: to, transitions: [...agent.transitions, record] };
    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  dispatch(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Dispatched, 'dispatch');
  }

  accept(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Accepted, 'accept');
  }

  reject(sessionId: Ulid, agentName: string, rejection: RejectionResponse): AgentInstance {
    const parseResult = RejectionResponseSchema.safeParse(rejection);
    if (!parseResult.success) {
      throw new TaskEnvelopeValidationError('Rejection response failed validation', parseResult.error.issues);
    }
    const agent = this.transition(sessionId, agentName, AgentState.Rejected, 'reject');
    const updated: AgentInstance = { ...agent, rejectionReason: parseResult.data };
    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  beginExecution(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Executing, 'begin_execution');
  }

  complete(sessionId: Ulid, agentName: string, result: AgentResult): AgentInstance {
    const agent = this.transition(sessionId, agentName, AgentState.Completed, 'complete');
    const updated: AgentInstance = { ...agent, result };
    this.sessions.get(sessionId)!.set(agentName, updated);
    return updated;
  }

  fail(sessionId: Ulid, agentName: string, reason: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Failed, `fail: ${reason}`);
  }

  verify(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Verified, 'verify');
  }

  requestRevision(sessionId: Ulid, agentName: string, feedback: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.RevisionRequested, `revision_requested: ${feedback}`);
  }

  resumeExecution(sessionId: Ulid, agentName: string): AgentInstance {
    return this.transition(sessionId, agentName, AgentState.Executing, 'resume_execution');
  }

  private requireAgent(sessionId: Ulid, agentName: string): AgentInstance {
    const agent = this.getAgent(sessionId, agentName);
    if (!agent) throw new Error(`Agent "${agentName}" not found in session ${sessionId}`);
    return agent;
  }
}
