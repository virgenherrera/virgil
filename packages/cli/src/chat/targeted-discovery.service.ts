import { Injectable } from '@nestjs/common';
import type {
  ChatMessage,
  ChatProvider,
  ChatSearchQuery,
  ChatThread,
} from '../contracts/chat-provider.types.js';
import type {
  DiscoveryScope,
  PaginatedResult,
} from '../contracts/common.types.js';

/**
 * Targeted discovery service for issue-driven chat search. Wraps
 * {@link ChatProvider} adapters with scoped, bounded queries. This
 * service intentionally avoids bulk channel enumeration or history
 * crawling — every search call is targeted by a specific query.
 */
@Injectable()
export class TargetedDiscoveryService {
  /**
   * Searches a chat provider for messages related to an issue or topic.
   * The query text is forwarded directly to the provider's
   * `searchMessages()`, bounded by the optional discovery scope.
   */
  async discoverForIssue(
    provider: ChatProvider,
    issueText: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>> {
    const query: ChatSearchQuery = { text: issueText };
    return provider.searchMessages(query, scope);
  }

  /**
   * Retrieves the full thread for a known thread identifier.
   */
  async discoverThread(
    provider: ChatProvider,
    threadId: string,
  ): Promise<ChatThread> {
    return provider.getThread(threadId);
  }

  /**
   * Searches within a specific channel for messages matching a query.
   */
  async discoverInChannel(
    provider: ChatProvider,
    channel: string,
    queryText: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>> {
    const query: ChatSearchQuery = { text: queryText, channel };
    return provider.searchMessages(query, scope);
  }
}
