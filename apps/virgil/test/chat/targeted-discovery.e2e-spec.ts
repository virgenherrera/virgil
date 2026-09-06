import { TargetedDiscoveryService } from '../../src/chat/targeted-discovery.service.js';
import type { ChatProvider, ChatSearchQuery } from '../../src/contracts/chat-provider.types.js';
import type { PaginatedResult, DiscoveryScope } from '../../src/contracts/common.types.js';
import type { ChatMessage, ChatThread } from '../../src/contracts/chat-provider.types.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';
import type { ContentHash, Timestamp } from '../../src/shared/primitives.js';

function mockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const ts = createTimestamp();
  return {
    id: 'msg-1',
    channel: 'general',
    author: 'alice',
    content: 'test message',
    timestamp: ts,
    identity: {
      uri: 'https://example.com/msg/1',
      hash: createContentHash('test message'),
      discoveredAt: ts,
    },
    ...overrides,
  };
}

function mockProvider(overrides: Partial<ChatProvider> = {}): ChatProvider {
  return {
    metadata: {
      id: 'test',
      name: 'Test',
      version: '0.0.1' as any,
      capabilities: [],
    },
    status: 'connected' as any,
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue('connected'),
    dispose: vi.fn().mockResolvedValue(undefined),
    searchMessages: vi.fn().mockResolvedValue({
      items: [mockMessage()],
      hasMore: false,
    } satisfies PaginatedResult<ChatMessage>),
    getThread: vi.fn().mockResolvedValue({
      id: 'thread-1',
      channel: 'general',
      messages: [mockMessage()],
      participants: ['alice'],
    } satisfies ChatThread),
    listChannels: vi.fn().mockResolvedValue({
      items: [],
      hasMore: false,
    }),
    health: vi.fn().mockResolvedValue({
      status: 'healthy',
      lastChecked: createTimestamp(),
    }),
    ...overrides,
  } as ChatProvider;
}

describe('TargetedDiscoveryService', () => {
  let service: TargetedDiscoveryService;

  beforeEach(() => {
    service = new TargetedDiscoveryService();
  });

  describe('discoverForIssue()', () => {
    it('delegates to provider.searchMessages with text query', async () => {
      const provider = mockProvider();
      const result = await service.discoverForIssue(provider, 'bug in login');
      expect(provider.searchMessages).toHaveBeenCalledWith(
        { text: 'bug in login' },
        undefined,
      );
      expect(result.items).toHaveLength(1);
    });

    it('passes discovery scope through to provider', async () => {
      const provider = mockProvider();
      const scope: DiscoveryScope = { maxItems: 10 };
      await service.discoverForIssue(provider, 'bug', scope);
      expect(provider.searchMessages).toHaveBeenCalledWith(
        { text: 'bug' },
        scope,
      );
    });
  });

  describe('discoverThread()', () => {
    it('delegates to provider.getThread with thread id', async () => {
      const provider = mockProvider();
      const result = await service.discoverThread(provider, 'thread-1');
      expect(provider.getThread).toHaveBeenCalledWith('thread-1');
      expect(result.id).toBe('thread-1');
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('discoverInChannel()', () => {
    it('delegates to provider.searchMessages with channel and text', async () => {
      const provider = mockProvider();
      const result = await service.discoverInChannel(
        provider,
        'general',
        'deploy issue',
      );
      expect(provider.searchMessages).toHaveBeenCalledWith(
        { text: 'deploy issue', channel: 'general' },
        undefined,
      );
      expect(result.items).toHaveLength(1);
    });

    it('passes discovery scope through', async () => {
      const provider = mockProvider();
      const scope: DiscoveryScope = { maxItems: 5 };
      await service.discoverInChannel(provider, 'dev', 'error', scope);
      expect(provider.searchMessages).toHaveBeenCalledWith(
        { text: 'error', channel: 'dev' },
        scope,
      );
    });
  });
});
