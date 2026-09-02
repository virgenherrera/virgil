import type { BrowserConfig } from '../session/browser-config-schema.js';
import {
  SessionManager,
  type CdpSessionHandle,
} from '../session/session-manager.js';
import { PomExecutor } from '../pom/pom-executor.js';
import type { PomDefinition } from '../pom/pom-schema.js';
import {
  buildNormalizedArtifact,
  type NormalizedArtifact,
} from '../output/normalized-artifact.js';
import {
  BrowserLaunchError,
  PomVersionMismatchError,
} from '../errors/cdp-errors.js';

/**
 * Contract between Virgil provider adapters (e.g. a Jira issue provider) and
 * the Playwright CDP browser automation layer. Independent of any specific
 * target web UI.
 */
export interface ICdpBrowserAdapter {
  /**
   * Launches (or reuses) an authenticated persistent browser session for
   * subsequent {@link ICdpBrowserAdapter.executePom} calls.
   *
   * @param config - Browser type, profile path, headless flag, and launch args.
   */
  launch(config: BrowserConfig): Promise<void>;

  /**
   * Navigates to `targetUrl`, runs `pom`'s navigation and extraction steps,
   * and returns a provider-neutral normalized artifact.
   *
   * @param pom - A validated POM definition to execute.
   * @param targetUrl - The URL to navigate to before extraction.
   * @returns The normalized, provenance-tagged extraction result.
   * @throws {PomVersionMismatchError} when `pom.targetApp` does not match
   * the adapter's active target, if one was pinned via {@link launch}.
   */
  executePom(
    pom: PomDefinition,
    targetUrl: string,
  ): Promise<NormalizedArtifact>;

  /** Detaches the CDP session, leaving the browser process and profile intact. */
  detach(): Promise<void>;

  /** Fully closes the browser session and releases the profile lock. */
  close(): Promise<void>;
}

export interface CdpBrowserAdapterOptions {
  readonly sessionManager?: SessionManager;
  readonly pomExecutor?: PomExecutor;
  /** When set, `executePom` rejects any POM whose `targetApp` does not match. */
  readonly pinnedTargetApp?: string;
}

/**
 * Default {@link ICdpBrowserAdapter} implementation, orchestrating
 * {@link SessionManager} and {@link PomExecutor}.
 */
export class CdpBrowserAdapter implements ICdpBrowserAdapter {
  private readonly sessionManager: SessionManager;
  private readonly pomExecutor: PomExecutor;
  private readonly pinnedTargetApp?: string;
  private session?: CdpSessionHandle;

  constructor(options: CdpBrowserAdapterOptions = {}) {
    this.sessionManager = options.sessionManager ?? new SessionManager();
    this.pomExecutor = options.pomExecutor ?? new PomExecutor();
    this.pinnedTargetApp = options.pinnedTargetApp;
  }

  async launch(config: BrowserConfig): Promise<void> {
    this.session = await this.sessionManager.createSession(config);
  }

  async executePom(
    pom: PomDefinition,
    targetUrl: string,
  ): Promise<NormalizedArtifact> {
    if (!this.session) {
      throw new BrowserLaunchError(
        'No active browser session. Call launch() first.',
        {
          pomTargetApp: pom.targetApp,
        },
      );
    }

    if (this.pinnedTargetApp && pom.targetApp !== this.pinnedTargetApp) {
      throw new PomVersionMismatchError(
        `POM target "${pom.targetApp}" does not match the adapter's pinned target "${this.pinnedTargetApp}".`,
        { pomTargetApp: pom.targetApp, pinnedTargetApp: this.pinnedTargetApp },
      );
    }

    const startedAt = Date.now();

    await this.session.page.goto(targetUrl, { timeout: 30_000 });
    const result = await this.pomExecutor.execute(pom, this.session.page);

    return buildNormalizedArtifact({
      content: result.fields,
      targetApp: pom.targetApp,
      url: targetUrl,
      pomVersion: pom.version,
      browser: this.session.browser,
      profilePath: this.session.profilePath,
      durationMs: Date.now() - startedAt,
    });
  }

  async detach(): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.sessionManager.detachSession(this.session);
    this.session = undefined;
  }

  async close(): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.sessionManager.closeSession(this.session);
    this.session = undefined;
  }
}
