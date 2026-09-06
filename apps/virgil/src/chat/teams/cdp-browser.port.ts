export interface CdpPomShape {
  readonly targetApp: string;
  readonly version: string;
  readonly description?: string;
  readonly navigationSteps: readonly Record<string, unknown>[];
  readonly extractionSteps: readonly Record<string, unknown>[];
  readonly outputShape: Record<string, { type: string; required: boolean }>;
  readonly metadata?: Record<string, unknown>;
}

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

export interface CdpBrowserConfig {
  readonly browser: string;
  readonly headless: boolean;
  readonly profilePath?: string;
  readonly launchArgs?: readonly string[];
}

export interface CdpBrowserPort {
  launch(config: CdpBrowserConfig): Promise<void>;
  executePom(pom: CdpPomShape, targetUrl: string): Promise<CdpExecutionResult>;
  detach(): Promise<void>;
  close(): Promise<void>;
}

export const CDP_BROWSER_PORT = Symbol('CDP_BROWSER_PORT');
