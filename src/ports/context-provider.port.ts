import type { Observable } from "rxjs";
import type { ProviderKind } from "../domain/refs.js";

const PROVIDER_STATUS = {
  AVAILABLE: "available",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
} as const;

export type ProviderStatus = (typeof PROVIDER_STATUS)[keyof typeof PROVIDER_STATUS];

export interface ProviderHealth {
  readonly status: ProviderStatus;
  readonly message?: string;
}

export interface SnapshotScope {
  readonly filter?: string;
  readonly maxItems?: number;
}

export interface ProviderSnapshot<T> {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly data: T;
}

export interface ProviderEvent<E> {
  readonly kind: ProviderKind;
  readonly backendId: string;
  readonly timestamp: Date;
  readonly payload: E;
}

export interface RefResolution {
  readonly resolved: boolean;
  readonly uri?: string;
  readonly label?: string;
}

export interface ContextProviderPort {
  readonly kind: ProviderKind;
  readonly backendId: string;
  readonly capabilityId: string;
  healthCheck(): Promise<ProviderHealth>;
  resolveRef(ref: string): Promise<RefResolution>;
}

export interface SnapshotProviderPort<T> extends ContextProviderPort {
  snapshot(scope: SnapshotScope): Promise<ProviderSnapshot<T>>;
}

export interface ObservableProviderPort<E> extends ContextProviderPort {
  poll(since: Date): Observable<ProviderEvent<E>>;
}
