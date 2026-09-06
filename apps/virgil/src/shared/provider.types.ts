import type { SemVer } from './primitives.js';

export enum ProviderCapability {
  KNOWLEDGE = 'knowledge',
  ISSUE = 'issue',
  REPOSITORY = 'repository',
  CHAT = 'chat',
  EMBEDDING = 'embedding',
  VECTOR_STORE = 'vector_store',
  RETRIEVER = 'retriever',
}

export interface ProviderMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: SemVer;
  readonly capabilities: readonly ProviderCapability[];
}

export enum ProviderStatus {
  REGISTERED = 'registered',
  CONFIGURED = 'configured',
  CONNECTED = 'connected',
  DEGRADED = 'degraded',
  DISCONNECTED = 'disconnected',
}

export interface Provider {
  readonly metadata: ProviderMetadata;
  readonly status: ProviderStatus;
  initialize(): Promise<void>;
  healthCheck(): Promise<ProviderStatus>;
  dispose(): Promise<void>;
}
