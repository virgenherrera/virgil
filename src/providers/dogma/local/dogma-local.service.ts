import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { stat, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import fg from "fast-glob";
import type {
  ProviderHealth,
  ProviderSnapshot,
  RefResolution,
  SnapshotProviderPort,
  SnapshotScope,
} from "../../../ports/context-provider.port.js";
import { buildRef, parseRef } from "../../../domain/refs.js";
import type { ProviderKind } from "../../../domain/refs.js";
import { CapabilityRegistryService } from "../../../capabilities/capability-registry.service.js";
import { ProviderRegistryService } from "../../provider-registry.service.js";
import { AppError, ERROR_CODE } from "../../../shared/errors.js";
import type { DogmaDocument } from "../dogma.types.js";
import {
  DOGMA_LOCAL_CONFIG_TOKEN,
  type DogmaLocalConfigType,
} from "./dogma-local.config.js";

const SUPPORTED_EXTENSIONS = ["md", "txt", "json", "yaml", "yml"];
const SCHEMA_VERSION = "1.0.0";

@Injectable()
export class DogmaLocalService
  implements SnapshotProviderPort<DogmaDocument[]>, OnModuleInit
{
  readonly kind: ProviderKind = "dogma";
  readonly backendId = "local";
  readonly capabilityId = "dogma-local";

  private readonly basePath: string;

  constructor(
    @Inject(DOGMA_LOCAL_CONFIG_TOKEN)
    private readonly config: DogmaLocalConfigType,
    @Inject(CapabilityRegistryService)
    private readonly capabilityRegistry: CapabilityRegistryService,
    @Inject(ProviderRegistryService)
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    this.basePath = resolve(this.config.path);
  }

  async onModuleInit(): Promise<void> {
    this.capabilityRegistry.register({
      id: this.capabilityId,
      description: `Local dogma documents from ${this.config.path}`,
      status: "configured-unverified",
    });
    this.providerRegistry.register(this);

    const health = await this.healthCheck();
    if (health.status === "available") {
      this.capabilityRegistry.markAvailable(this.capabilityId);
    } else {
      this.capabilityRegistry.markDegraded(this.capabilityId);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const info = await stat(this.basePath);
      if (!info.isDirectory()) {
        return {
          status: "unavailable",
          message: `Path is not a directory: ${this.basePath}`,
        };
      }
      return { status: "available", message: `Serving from ${this.basePath}` };
    } catch {
      return {
        status: "unavailable",
        message: `Path not accessible: ${this.basePath}`,
      };
    }
  }

  async snapshot(
    scope: SnapshotScope,
  ): Promise<ProviderSnapshot<DogmaDocument[]>> {
    const pattern = SUPPORTED_EXTENSIONS.map(
      (ext) => `**/*.${ext}`,
    );

    let entries = await fg(pattern, {
      cwd: this.basePath,
      absolute: false,
      onlyFiles: true,
      dot: false,
    });

    if (scope.filter) {
      const filterLower = scope.filter.toLowerCase();
      entries = entries.filter((e) =>
        e.toLowerCase().includes(filterLower),
      );
    }

    if (scope.maxItems && entries.length > scope.maxItems) {
      entries = entries.slice(0, scope.maxItems);
    }

    const documents: DogmaDocument[] = await Promise.all(
      entries.map(async (relativePath) => {
        const absolutePath = resolve(this.basePath, relativePath);
        const [content, info] = await Promise.all([
          readFile(absolutePath, "utf-8"),
          stat(absolutePath),
        ]);
        return {
          ref: buildRef("dogma", "local", relativePath),
          relativePath,
          content,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        };
      }),
    );

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      data: documents,
    };
  }

  async resolveRef(ref: string): Promise<RefResolution> {
    const parsed = parseRef(ref);

    if (parsed.kind !== "dogma" || parsed.backend !== "local") {
      return { resolved: false };
    }

    const absolutePath = resolve(this.basePath, parsed.id);

    // Prevent path traversal
    if (!absolutePath.startsWith(this.basePath)) {
      throw new AppError(
        `Ref path escapes base directory: ${ref}`,
        ERROR_CODE.REF_UNRESOLVABLE,
      );
    }

    try {
      const content = await readFile(absolutePath, "utf-8");
      return {
        resolved: true,
        uri: `file://${absolutePath}`,
        label: relative(this.basePath, absolutePath),
      };
    } catch {
      return { resolved: false };
    }
  }
}
