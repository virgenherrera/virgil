import { Injectable } from "@nestjs/common";

const CAPABILITY_STATUS = {
  CONFIGURED_UNVERIFIED: "configured-unverified",
  AVAILABLE: "available",
  DEGRADED: "degraded",
} as const;

export type CapabilityStatus =
  (typeof CAPABILITY_STATUS)[keyof typeof CAPABILITY_STATUS];

export interface AgentCapability {
  readonly id: string;
  readonly description: string;
  readonly status: CapabilityStatus;
  readonly refs?: readonly string[];
}

@Injectable()
export class CapabilityRegistryService {
  private readonly capabilities = new Map<string, AgentCapability>();

  register(capability: AgentCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  markAvailable(id: string, refs?: readonly string[]): void {
    const cap = this.capabilities.get(id);
    if (!cap) {
      return;
    }
    this.capabilities.set(id, {
      ...cap,
      status: CAPABILITY_STATUS.AVAILABLE,
      refs: refs ?? cap.refs,
    });
  }

  markDegraded(id: string): void {
    const cap = this.capabilities.get(id);
    if (!cap) {
      return;
    }
    this.capabilities.set(id, {
      ...cap,
      status: CAPABILITY_STATUS.DEGRADED,
    });
  }

  list(): readonly AgentCapability[] {
    return Array.from(this.capabilities.values());
  }
}
