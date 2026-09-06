import { Module } from '@nestjs/common';
import { CodeGraphService } from './codegraph.service.js';
import { LocalRepoProviderFactory } from './local-repo-provider.factory.js';

/**
 * Hosts the local repository provider (H05): Git-aware metadata extraction,
 * bounded file discovery, and optional CodeGraph structural intelligence.
 *
 * Exports `LocalRepoProviderFactory` (creates per-repository provider
 * instances) and `CodeGraphService` (structural code queries) for
 * injection by consuming modules.
 */
@Module({
  providers: [LocalRepoProviderFactory, CodeGraphService],
  exports: [LocalRepoProviderFactory, CodeGraphService],
})
export class RepoModule {}
