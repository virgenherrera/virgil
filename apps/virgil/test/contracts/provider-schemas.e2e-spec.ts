import {
  createContentHash,
  createTimestamp,
} from '../../src/shared/primitives.js';
import {
  ChatMessageSchema,
  ChatMessagePageSchema,
  ChatThreadSchema,
  ChatChannelSchema,
  ChatChannelPageSchema,
  ChatSearchQuerySchema,
} from '../../src/contracts/chat-provider.types.js';
import {
  IssueStatus,
  IssueStatusSchema,
  IssueReferenceType,
  IssueReferenceSchema,
  NormalisedIssueSchema,
  NormalisedIssuePageSchema,
  IssueSearchQuerySchema,
} from '../../src/contracts/issue-provider.types.js';
import {
  KnowledgeDocumentSchema,
  KnowledgeDocumentPageSchema,
} from '../../src/contracts/knowledge-provider.types.js';
import {
  FileEntrySchema,
  FileEntryPageSchema,
  FileContentSchema,
  RepoMetadataSchema,
  GitCommitInfoSchema,
  GitContextSchema,
} from '../../src/contracts/repo-provider.types.js';
import {
  EmbeddingResultSchema,
  EmbeddingModelInfoSchema,
} from '../../src/contracts/embedding-provider.types.js';
import {
  RetrievalStrategy,
  RetrievalStrategySchema,
  RetrievalResultSource,
  RetrievalOptionsSchema,
  RetrievalResultSchema,
} from '../../src/contracts/retriever.types.js';
import {
  VectorEntrySchema,
  VectorSearchOptionsSchema,
  VectorSearchResultSchema,
} from '../../src/contracts/vector-store.types.js';

const identity = {
  uri: 'https://example.com/resource',
  hash: createContentHash('content'),
  discoveredAt: createTimestamp(),
};

describe('chat provider schemas', () => {
  const validMessage = {
    id: 'msg-1',
    channel: 'general',
    author: 'alice',
    content: 'Hello world',
    timestamp: createTimestamp(),
    identity,
  };

  it('ChatMessageSchema accepts valid message', () => {
    expect(ChatMessageSchema.safeParse(validMessage).success).toBe(true);
  });

  it('ChatMessageSchema accepts optional threadId', () => {
    expect(
      ChatMessageSchema.safeParse({ ...validMessage, threadId: 'th-1' })
        .success,
    ).toBe(true);
  });

  it('ChatMessageSchema rejects empty id', () => {
    expect(
      ChatMessageSchema.safeParse({ ...validMessage, id: '' }).success,
    ).toBe(false);
  });

  it('ChatMessagePageSchema validates paginated messages', () => {
    expect(
      ChatMessagePageSchema.safeParse({
        items: [validMessage],
        hasMore: false,
      }).success,
    ).toBe(true);
  });

  it('ChatThreadSchema accepts valid thread', () => {
    expect(
      ChatThreadSchema.safeParse({
        id: 'th-1',
        channel: 'general',
        messages: [validMessage],
        participants: ['alice'],
      }).success,
    ).toBe(true);
  });

  it('ChatChannelSchema accepts valid channel', () => {
    expect(
      ChatChannelSchema.safeParse({ id: 'ch-1', name: 'general' }).success,
    ).toBe(true);
  });

  it('ChatChannelSchema accepts optional topic', () => {
    expect(
      ChatChannelSchema.safeParse({
        id: 'ch-1',
        name: 'general',
        topic: 'Discussion',
      }).success,
    ).toBe(true);
  });

  it('ChatChannelPageSchema validates paginated channels', () => {
    expect(
      ChatChannelPageSchema.safeParse({
        items: [{ id: 'ch-1', name: 'general' }],
        hasMore: true,
        cursor: 'abc',
      }).success,
    ).toBe(true);
  });

  it('ChatSearchQuerySchema accepts valid query', () => {
    expect(
      ChatSearchQuerySchema.safeParse({ text: 'deploy' }).success,
    ).toBe(true);
  });

  it('ChatSearchQuerySchema rejects empty text', () => {
    expect(
      ChatSearchQuerySchema.safeParse({ text: '' }).success,
    ).toBe(false);
  });
});

describe('issue provider schemas', () => {
  describe('IssueStatus', () => {
    it('exposes all expected values', () => {
      expect(IssueStatus.OPEN).toBe('open');
      expect(IssueStatus.IN_PROGRESS).toBe('in_progress');
      expect(IssueStatus.BLOCKED).toBe('blocked');
      expect(IssueStatus.IN_REVIEW).toBe('in_review');
      expect(IssueStatus.DONE).toBe('done');
      expect(IssueStatus.CLOSED).toBe('closed');
    });

    it('validates via schema', () => {
      expect(IssueStatusSchema.safeParse('open').success).toBe(true);
      expect(IssueStatusSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('IssueReferenceType', () => {
    it('exposes all expected values', () => {
      expect(IssueReferenceType.ISSUE).toBe('issue');
      expect(IssueReferenceType.PULL_REQUEST).toBe('pull_request');
      expect(IssueReferenceType.DOCUMENT).toBe('document');
    });
  });

  it('IssueReferenceSchema accepts valid reference', () => {
    expect(
      IssueReferenceSchema.safeParse({
        type: 'issue',
        uri: 'https://github.com/org/repo/issues/1',
      }).success,
    ).toBe(true);
  });

  it('IssueReferenceSchema accepts optional label', () => {
    expect(
      IssueReferenceSchema.safeParse({
        type: 'pull_request',
        uri: 'https://github.com/org/repo/pull/5',
        label: 'Fix bug',
      }).success,
    ).toBe(true);
  });

  it('NormalisedIssueSchema accepts valid issue', () => {
    const result = NormalisedIssueSchema.safeParse({
      id: 'issue-1',
      externalId: 'GH-42',
      title: 'Fix login',
      description: 'The login form is broken',
      status: 'open',
      labels: ['bug'],
      references: [],
      identity,
      metadata: {},
    });
    expect(result.success).toBe(true);
  });

  it('NormalisedIssueSchema rejects empty title', () => {
    const result = NormalisedIssueSchema.safeParse({
      id: 'issue-1',
      externalId: 'GH-42',
      title: '',
      description: '',
      status: 'open',
      labels: [],
      references: [],
      identity,
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('NormalisedIssuePageSchema validates paginated issues', () => {
    const validIssue = {
      id: 'i-1',
      externalId: 'GH-1',
      title: 'Issue',
      description: '',
      status: 'done',
      labels: [],
      references: [],
      identity,
      metadata: {},
    };
    expect(
      NormalisedIssuePageSchema.safeParse({
        items: [validIssue],
        hasMore: false,
      }).success,
    ).toBe(true);
  });

  it('IssueSearchQuerySchema accepts valid query', () => {
    expect(
      IssueSearchQuerySchema.safeParse({ text: 'bug', status: 'open' })
        .success,
    ).toBe(true);
  });

  it('IssueSearchQuerySchema accepts empty query', () => {
    expect(IssueSearchQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('knowledge provider schemas', () => {
  const validDoc = {
    identity,
    title: 'Architecture',
    mimeType: 'text/markdown',
    content: '# Architecture\n',
    metadata: { source: 'wiki' },
  };

  it('KnowledgeDocumentSchema accepts valid document', () => {
    expect(KnowledgeDocumentSchema.safeParse(validDoc).success).toBe(true);
  });

  it('KnowledgeDocumentSchema rejects empty title', () => {
    expect(
      KnowledgeDocumentSchema.safeParse({ ...validDoc, title: '' }).success,
    ).toBe(false);
  });

  it('KnowledgeDocumentSchema rejects empty mimeType', () => {
    expect(
      KnowledgeDocumentSchema.safeParse({ ...validDoc, mimeType: '' }).success,
    ).toBe(false);
  });

  it('KnowledgeDocumentPageSchema validates paginated documents', () => {
    expect(
      KnowledgeDocumentPageSchema.safeParse({
        items: [validDoc],
        hasMore: false,
      }).success,
    ).toBe(true);
  });
});

describe('repo provider schemas', () => {
  it('FileEntrySchema accepts valid entry', () => {
    expect(
      FileEntrySchema.safeParse({
        path: 'src/index.ts',
        size: 512,
        lastModified: createTimestamp(),
      }).success,
    ).toBe(true);
  });

  it('FileEntrySchema accepts optional mimeType', () => {
    expect(
      FileEntrySchema.safeParse({
        path: 'src/index.ts',
        mimeType: 'text/typescript',
        size: 512,
        lastModified: createTimestamp(),
      }).success,
    ).toBe(true);
  });

  it('FileEntrySchema rejects empty path', () => {
    expect(
      FileEntrySchema.safeParse({
        path: '',
        size: 0,
        lastModified: createTimestamp(),
      }).success,
    ).toBe(false);
  });

  it('FileEntryPageSchema validates paginated entries', () => {
    expect(
      FileEntryPageSchema.safeParse({
        items: [{ path: 'a.ts', size: 10, lastModified: createTimestamp() }],
        hasMore: false,
      }).success,
    ).toBe(true);
  });

  it('FileContentSchema accepts valid content', () => {
    expect(
      FileContentSchema.safeParse({
        path: 'src/main.ts',
        content: 'console.log("hi")',
        identity,
      }).success,
    ).toBe(true);
  });

  it('RepoMetadataSchema accepts valid metadata', () => {
    expect(
      RepoMetadataSchema.safeParse({
        name: 'virgil',
        root: '/home/user/virgil',
        defaultBranch: 'main',
        remotes: ['origin'],
        identity,
      }).success,
    ).toBe(true);
  });

  it('RepoMetadataSchema rejects empty name', () => {
    expect(
      RepoMetadataSchema.safeParse({
        name: '',
        root: '/',
        defaultBranch: 'main',
        remotes: [],
        identity,
      }).success,
    ).toBe(false);
  });

  it('GitCommitInfoSchema accepts valid commit', () => {
    expect(
      GitCommitInfoSchema.safeParse({
        hash: 'abc123',
        message: 'initial commit',
        timestamp: createTimestamp(),
      }).success,
    ).toBe(true);
  });

  it('GitContextSchema accepts valid context', () => {
    expect(
      GitContextSchema.safeParse({
        currentBranch: 'main',
        lastCommit: {
          hash: 'abc123',
          message: 'init',
          timestamp: createTimestamp(),
        },
        isDirty: false,
        trackedFileCount: 42,
      }).success,
    ).toBe(true);
  });

  it('GitContextSchema rejects negative trackedFileCount', () => {
    expect(
      GitContextSchema.safeParse({
        currentBranch: 'main',
        lastCommit: {
          hash: 'x',
          message: '',
          timestamp: createTimestamp(),
        },
        isDirty: false,
        trackedFileCount: -1,
      }).success,
    ).toBe(false);
  });
});

describe('embedding provider schemas', () => {
  it('EmbeddingResultSchema accepts valid result', () => {
    expect(
      EmbeddingResultSchema.safeParse({
        vector: [0.1, 0.2, 0.3],
        tokenCount: 5,
        model: 'text-embedding-3-small',
      }).success,
    ).toBe(true);
  });

  it('EmbeddingResultSchema rejects empty vector', () => {
    expect(
      EmbeddingResultSchema.safeParse({
        vector: [],
        tokenCount: 0,
        model: 'test',
      }).success,
    ).toBe(false);
  });

  it('EmbeddingModelInfoSchema accepts valid info', () => {
    expect(
      EmbeddingModelInfoSchema.safeParse({
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        maxTokens: 8191,
      }).success,
    ).toBe(true);
  });

  it('EmbeddingModelInfoSchema rejects non-positive dimensions', () => {
    expect(
      EmbeddingModelInfoSchema.safeParse({
        provider: 'openai',
        model: 'test',
        dimensions: 0,
        maxTokens: 100,
      }).success,
    ).toBe(false);
  });
});

describe('retriever schemas', () => {
  describe('RetrievalStrategy', () => {
    it('exposes all expected values', () => {
      expect(RetrievalStrategy.LEXICAL).toBe('lexical');
      expect(RetrievalStrategy.SEMANTIC).toBe('semantic');
      expect(RetrievalStrategy.HYBRID).toBe('hybrid');
    });

    it('validates via schema', () => {
      expect(RetrievalStrategySchema.safeParse('hybrid').success).toBe(true);
      expect(RetrievalStrategySchema.safeParse('invalid').success).toBe(false);
    });
  });

  it('RetrievalOptionsSchema accepts valid options', () => {
    expect(
      RetrievalOptionsSchema.safeParse({
        topK: 10,
        strategy: 'semantic',
      }).success,
    ).toBe(true);
  });

  it('RetrievalOptionsSchema accepts optional filter and rerank', () => {
    expect(
      RetrievalOptionsSchema.safeParse({
        topK: 5,
        strategy: 'hybrid',
        filter: { workspace: 'default' },
        rerank: true,
      }).success,
    ).toBe(true);
  });

  it('RetrievalOptionsSchema rejects non-positive topK', () => {
    expect(
      RetrievalOptionsSchema.safeParse({
        topK: 0,
        strategy: 'lexical',
      }).success,
    ).toBe(false);
  });

  describe('RetrievalResultSource', () => {
    it('exposes all expected values', () => {
      expect(RetrievalResultSource.LEXICAL).toBe('lexical');
      expect(RetrievalResultSource.SEMANTIC).toBe('semantic');
      expect(RetrievalResultSource.FUSED).toBe('fused');
    });
  });

  it('RetrievalResultSchema accepts valid result', () => {
    expect(
      RetrievalResultSchema.safeParse({
        id: 'r-1',
        content: 'matched text',
        score: 0.95,
        source: 'semantic',
        metadata: {},
        provenance: identity,
      }).success,
    ).toBe(true);
  });

  it('RetrievalResultSchema rejects empty id', () => {
    expect(
      RetrievalResultSchema.safeParse({
        id: '',
        content: '',
        score: 0,
        source: 'lexical',
        metadata: {},
        provenance: identity,
      }).success,
    ).toBe(false);
  });
});

describe('vector store schemas', () => {
  it('VectorEntrySchema accepts valid entry', () => {
    expect(
      VectorEntrySchema.safeParse({
        id: 'v-1',
        vector: [0.1, 0.2],
        metadata: { source: 'wiki' },
      }).success,
    ).toBe(true);
  });

  it('VectorEntrySchema accepts optional content', () => {
    expect(
      VectorEntrySchema.safeParse({
        id: 'v-1',
        vector: [0.1],
        metadata: {},
        content: 'some text',
      }).success,
    ).toBe(true);
  });

  it('VectorEntrySchema rejects empty vector', () => {
    expect(
      VectorEntrySchema.safeParse({
        id: 'v-1',
        vector: [],
        metadata: {},
      }).success,
    ).toBe(false);
  });

  it('VectorEntrySchema rejects empty id', () => {
    expect(
      VectorEntrySchema.safeParse({
        id: '',
        vector: [0.1],
        metadata: {},
      }).success,
    ).toBe(false);
  });

  it('VectorSearchOptionsSchema accepts valid options', () => {
    expect(
      VectorSearchOptionsSchema.safeParse({ topK: 10 }).success,
    ).toBe(true);
  });

  it('VectorSearchOptionsSchema accepts optional threshold and filter', () => {
    expect(
      VectorSearchOptionsSchema.safeParse({
        topK: 5,
        threshold: 0.8,
        filter: { workspace: 'prod' },
      }).success,
    ).toBe(true);
  });

  it('VectorSearchOptionsSchema rejects threshold above 1', () => {
    expect(
      VectorSearchOptionsSchema.safeParse({
        topK: 5,
        threshold: 1.5,
      }).success,
    ).toBe(false);
  });

  it('VectorSearchResultSchema accepts valid result', () => {
    expect(
      VectorSearchResultSchema.safeParse({
        id: 'v-1',
        score: 0.92,
        metadata: {},
      }).success,
    ).toBe(true);
  });

  it('VectorSearchResultSchema accepts optional content', () => {
    expect(
      VectorSearchResultSchema.safeParse({
        id: 'v-1',
        score: 0.5,
        metadata: {},
        content: 'matched chunk',
      }).success,
    ).toBe(true);
  });
});
