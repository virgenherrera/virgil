import { Module } from '@nestjs/common';
import { ChatProviderFactory } from './chat-provider.factory.js';
import { TargetedDiscoveryService } from './targeted-discovery.service.js';

/**
 * Hosts the chat provider adapters (H14): Slack API-based and Microsoft
 * Teams CDP-based chat discovery, with targeted search, thread retrieval,
 * bounded pagination, and provenance metadata.
 *
 * Exports `ChatProviderFactory` (creates per-platform provider instances)
 * and `TargetedDiscoveryService` (issue-driven search coordination)
 * for injection by consuming modules.
 */
@Module({
  providers: [ChatProviderFactory, TargetedDiscoveryService],
  exports: [ChatProviderFactory, TargetedDiscoveryService],
})
export class ChatModule {}
