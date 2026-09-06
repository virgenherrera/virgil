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

@Injectable()
export class TargetedDiscoveryService {
  async discoverForIssue(
    provider: ChatProvider,
    issueText: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>> {
    const query: ChatSearchQuery = { text: issueText };
    return provider.searchMessages(query, scope);
  }

  async discoverThread(
    provider: ChatProvider,
    threadId: string,
  ): Promise<ChatThread> {
    return provider.getThread(threadId);
  }

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
