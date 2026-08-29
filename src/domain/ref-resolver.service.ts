import { Inject, Injectable } from "@nestjs/common";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { parseRef } from "./refs.js";
import type { RefResolution } from "../ports/context-provider.port.js";

@Injectable()
export class RefResolverService {
  constructor(
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async resolve(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);
    const providers = this.providerRegistry.getByKind(parsed.kind);

    for (const provider of providers) {
      try {
        const result = await provider.resolveRef(ref);
        if (result.resolved) return result;
      } catch {
        // try next provider
      }
    }

    return { resolved: false };
  }

  async resolveMany(
    refs: readonly string[],
  ): Promise<Map<string, RefResolution>> {
    const results = new Map<string, RefResolution>();
    await Promise.all(
      refs.map(async (ref) => {
        results.set(ref, await this.resolve(ref));
      }),
    );
    return results;
  }
}
