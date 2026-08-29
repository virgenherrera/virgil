import { Injectable } from "@nestjs/common";
import type { ContextProviderPort, ProviderHealth } from "../ports/context-provider.port.js";
import type { ProviderKind } from "../domain/refs.js";

@Injectable()
export class ProviderRegistryService {
  private readonly providers = new Map<string, ContextProviderPort>();

  register(provider: ContextProviderPort): void {
    this.providers.set(provider.capabilityId, provider);
  }

  getByKind(kind: ProviderKind): ContextProviderPort[] {
    return Array.from(this.providers.values()).filter(
      (p) => p.kind === kind,
    );
  }

  getByCapabilityId(id: string): ContextProviderPort | undefined {
    return this.providers.get(id);
  }

  getAll(): ContextProviderPort[] {
    return Array.from(this.providers.values());
  }

  async healthCheckAll(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    for (const [id, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        results.set(id, health);
      } catch (error) {
        results.set(id, {
          status: "unavailable",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}
