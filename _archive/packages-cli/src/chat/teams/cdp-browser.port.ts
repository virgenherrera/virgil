/**
 * Hexagonal port for browser-automation adapters. The Teams chat adapter
 * depends on this interface rather than on the concrete `@virgil/pw-cdp`
 * package, preserving testability and build-order independence.
 *
 * At runtime the host module wires `CdpBrowserAdapter` from pw-cdp;
 * in tests a plain mock satisfies the port.
 */

/** Minimal POM definition shape consumed by the Teams adapter. */
export interface CdpPomShape {
  readonly targetApp: string;
  readonly version: string;
  readonly description?: string;
  readonly navigationSteps: readonly Record<string, unknown>[];
  readonly extractionSteps: readonly Record<string, unknown>[];
  readonly outputShape: Record<string, { type: string; required: boolean }>;
  readonly metadata?: Record<string, unknown>;
}

/** Extraction result returned by a CDP POM execution. */
export interface CdpExecutionResult {
  readonly content: Record<string, unknown>;
  readonly provenance: {
    readonly targetApp: string;
    readonly url: string;
    readonly pomVersion: string;
  };
  readonly contentHash: string;
  readonly extractedAt: string;
  readonly metadata: {
    readonly browser: string;
    readonly profilePath: string;
    readonly durationMs: number;
  };
}

/** Browser configuration for launching a CDP session. */
export interface CdpBrowserConfig {
  readonly browser: string;
  readonly headless: boolean;
  readonly profilePath?: string;
  readonly launchArgs?: readonly string[];
}

/** Port contract that `CdpBrowserAdapter` from pw-cdp satisfies structurally. */
export interface CdpBrowserPort {
  launch(config: CdpBrowserConfig): Promise<void>;
  executePom(pom: CdpPomShape, targetUrl: string): Promise<CdpExecutionResult>;
  detach(): Promise<void>;
  close(): Promise<void>;
}

/** Injection token for the CDP browser port. */
export const CDP_BROWSER_PORT = Symbol('CDP_BROWSER_PORT');
