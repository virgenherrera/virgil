import type { SemVer } from './primitives.js';

/**
 * Provider capability categories. A provider declares one or more of these
 * to advertise what kind of work it can perform for the CLI.
 */
export enum ProviderCapability {
  KNOWLEDGE = 'knowledge',
  ISSUE = 'issue',
  REPOSITORY = 'repository',
  CHAT = 'chat',
  EMBEDDING = 'embedding',
  VECTOR_STORE = 'vector_store',
  RETRIEVER = 'retriever',
}

/** Static identity and capability advertisement for a provider. */
export interface ProviderMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: SemVer;
  readonly capabilities: readonly ProviderCapability[];
}

/** Provider connection lifecycle states. */
export enum ProviderStatus {
  REGISTERED = 'registered',
  CONFIGURED = 'configured',
  CONNECTED = 'connected',
  DEGRADED = 'degraded',
  DISCONNECTED = 'disconnected',
}

/**
 * Base hexagonal port that every provider adapter implements.
 *
 * This is intentionally minimal: capability-specific ports (knowledge,
 * issue, repository, chat, embedding, vector store, retriever) extend this
 * with their own operations.
 */
export interface Provider {
  readonly metadata: ProviderMetadata;
  readonly status: ProviderStatus;
  initialize(): Promise<void>;
  healthCheck(): Promise<ProviderStatus>;
  dispose(): Promise<void>;
}
