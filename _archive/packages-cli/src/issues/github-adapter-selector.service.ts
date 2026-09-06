import { Injectable } from '@nestjs/common';
import type { IssueProvider } from '../contracts/issue-provider.types.js';
import { GitHubApiAdapter } from './github-api.adapter.js';
import type { ICdpBrowser } from './github-cdp.adapter.js';
import { GitHubCdpAdapter } from './github-cdp.adapter.js';
import {
  GitHubAdapterPreference,
  type GitHubIssuesConfig,
} from './github-issues-config.schema.js';
import type { IHttpClient } from './http-client.js';

/**
 * Result of the adapter selection process, carrying the chosen adapter
 * and the rationale for the selection.
 */
export interface AdapterSelectionResult {
  readonly adapter: IssueProvider;
  readonly selectedAdapter: 'api' | 'cdp';
  readonly reason: string;
}

/**
 * NestJS-injectable service that selects between the GitHub REST API adapter
 * and the CDP browser adapter based on configuration and runtime availability.
 *
 * Selection strategy:
 * - `api` preference: use API adapter unconditionally.
 * - `cdp` preference: use CDP adapter unconditionally.
 * - `auto` preference: try API first; on initialisation failure, fall back to CDP.
 */
@Injectable()
export class GitHubAdapterSelectorService {
  /**
   * Selects and initialises the appropriate GitHub Issues adapter.
   *
   * @param config - Validated GitHub Issues configuration.
   * @param http - HTTP client for the API adapter.
   * @param token - Optional authentication token.
   * @param cdpBrowser - Optional CDP browser instance for the fallback adapter.
   * @returns The selected, initialised adapter with selection metadata.
   */
  async select(
    config: GitHubIssuesConfig,
    http: IHttpClient,
    token?: string,
    cdpBrowser?: ICdpBrowser | null,
  ): Promise<AdapterSelectionResult> {
    switch (config.adapterPreference) {
      case GitHubAdapterPreference.API:
        return this.selectApi(config, http, token);

      case GitHubAdapterPreference.CDP:
        return this.selectCdp(config, cdpBrowser ?? null);

      case GitHubAdapterPreference.AUTO:
      default:
        return this.selectAuto(config, http, token, cdpBrowser ?? null);
    }
  }

  private async selectApi(
    config: GitHubIssuesConfig,
    http: IHttpClient,
    token?: string,
  ): Promise<AdapterSelectionResult> {
    const adapter = new GitHubApiAdapter(config, http, token);
    await adapter.initialize();
    return {
      adapter,
      selectedAdapter: 'api',
      reason: 'API adapter selected by preference',
    };
  }

  private async selectCdp(
    config: GitHubIssuesConfig,
    cdpBrowser: ICdpBrowser | null,
  ): Promise<AdapterSelectionResult> {
    const adapter = new GitHubCdpAdapter(config, cdpBrowser);
    await adapter.initialize();
    return {
      adapter,
      selectedAdapter: 'cdp',
      reason: 'CDP adapter selected by preference',
    };
  }

  private async selectAuto(
    config: GitHubIssuesConfig,
    http: IHttpClient,
    token?: string,
    cdpBrowser?: ICdpBrowser | null,
  ): Promise<AdapterSelectionResult> {
    // Try API first
    try {
      const apiAdapter = new GitHubApiAdapter(config, http, token);
      await apiAdapter.initialize();
      return {
        adapter: apiAdapter,
        selectedAdapter: 'api',
        reason: 'API adapter selected (auto: API succeeded)',
      };
    } catch {
      // API failed, try CDP fallback
    }

    // Fallback to CDP
    if (cdpBrowser) {
      try {
        const cdpAdapter = new GitHubCdpAdapter(config, cdpBrowser);
        await cdpAdapter.initialize();
        return {
          adapter: cdpAdapter,
          selectedAdapter: 'cdp',
          reason: 'CDP adapter selected (auto: API failed, CDP fallback)',
        };
      } catch {
        // CDP also failed
      }
    }

    throw new Error(
      `No adapter available for ${config.owner}/${config.repo}: both API and CDP failed`,
    );
  }
}
