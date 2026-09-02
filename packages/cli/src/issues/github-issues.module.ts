import { Module } from '@nestjs/common';
import { GitHubAdapterSelectorService } from './github-adapter-selector.service.js';
import { FetchHttpClient, HTTP_CLIENT } from './http-client.js';

/**
 * Hosts the GitHub Issues provider (H12): dual-adapter architecture
 * (REST API + CDP fallback) for fetching, normalising, and searching
 * GitHub issues.
 *
 * Exports:
 * - `GitHubAdapterSelectorService` — selects and initialises the adapter.
 * - `HTTP_CLIENT` — injectable HTTP client (overridable in tests).
 */
@Module({
  providers: [
    GitHubAdapterSelectorService,
    {
      provide: HTTP_CLIENT,
      useClass: FetchHttpClient,
    },
  ],
  exports: [GitHubAdapterSelectorService, HTTP_CLIENT],
})
export class GitHubIssuesModule {}
