import {
  AdapterType,
  AdapterTypeSchema,
  ProviderHealthStatus,
  ProviderHealthSchema,
  ProviderMetadataSchema,
  createPaginatedResultSchema,
  ProviderErrorSchema,
  ContentIdentitySchema,
  DiscoveryScopeSchema,
} from '../../src/contracts/common.types.js';
import {
  createContentHash,
  createTimestamp,
} from '../../src/shared/primitives.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';
import { z } from 'zod';

describe('common types', () => {
  describe('AdapterType', () => {
    it('exposes all expected values', () => {
      expect(AdapterType.API).toBe('api');
      expect(AdapterType.BROWSER).toBe('browser');
      expect(AdapterType.FILESYSTEM).toBe('filesystem');
    });

    it('contains exactly three members', () => {
      expect(Object.values(AdapterType)).toHaveLength(3);
    });

    it('validates via schema', () => {
      expect(AdapterTypeSchema.safeParse('api').success).toBe(true);
      expect(AdapterTypeSchema.safeParse('browser').success).toBe(true);
      expect(AdapterTypeSchema.safeParse('filesystem').success).toBe(true);
      expect(AdapterTypeSchema.safeParse('unknown').success).toBe(false);
    });
  });

  describe('ProviderHealthStatus', () => {
    it('exposes all expected values', () => {
      expect(ProviderHealthStatus.HEALTHY).toBe('healthy');
      expect(ProviderHealthStatus.DEGRADED).toBe('degraded');
      expect(ProviderHealthStatus.UNAVAILABLE).toBe('unavailable');
    });

    it('contains exactly three members', () => {
      expect(Object.values(ProviderHealthStatus)).toHaveLength(3);
    });
  });

  describe('ProviderHealthSchema', () => {
    it('accepts a valid health object', () => {
      const result = ProviderHealthSchema.safeParse({
        status: 'healthy',
        lastChecked: createTimestamp(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional message', () => {
      const result = ProviderHealthSchema.safeParse({
        status: 'degraded',
        lastChecked: createTimestamp(),
        message: 'Rate limited',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty message', () => {
      const result = ProviderHealthSchema.safeParse({
        status: 'healthy',
        lastChecked: createTimestamp(),
        message: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = ProviderHealthSchema.safeParse({
        status: 'broken',
        lastChecked: createTimestamp(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProviderMetadataSchema', () => {
    it('accepts valid metadata', () => {
      const result = ProviderMetadataSchema.safeParse({
        id: 'slack-1',
        name: 'Slack Provider',
        version: '1.0.0',
        capabilities: [ProviderCapability.CHAT],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty id', () => {
      const result = ProviderMetadataSchema.safeParse({
        id: '',
        name: 'Test',
        version: '1.0.0',
        capabilities: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = ProviderMetadataSchema.safeParse({
        id: 'x',
        name: '',
        version: '1.0.0',
        capabilities: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid semver', () => {
      const result = ProviderMetadataSchema.safeParse({
        id: 'x',
        name: 'Test',
        version: 'not-a-version',
        capabilities: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPaginatedResultSchema', () => {
    it('produces a schema validating paginated results', () => {
      const itemSchema = z.object({ name: z.string() });
      const pageSchema = createPaginatedResultSchema(itemSchema);

      const result = pageSchema.safeParse({
        items: [{ name: 'a' }, { name: 'b' }],
        hasMore: true,
        cursor: 'next-page',
      });
      expect(result.success).toBe(true);
    });

    it('validates items against the provided schema', () => {
      const itemSchema = z.object({ name: z.string() });
      const pageSchema = createPaginatedResultSchema(itemSchema);

      const result = pageSchema.safeParse({
        items: [{ invalid: true }],
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('allows omitted cursor', () => {
      const pageSchema = createPaginatedResultSchema(z.string());
      const result = pageSchema.safeParse({
        items: ['a'],
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty cursor', () => {
      const pageSchema = createPaginatedResultSchema(z.string());
      const result = pageSchema.safeParse({
        items: [],
        hasMore: false,
        cursor: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProviderErrorSchema', () => {
    const validError = {
      provider: {
        id: 'gh-1',
        name: 'GitHub',
        version: '2.0.0',
        capabilities: [ProviderCapability.ISSUE],
      },
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      recoverable: true,
    };

    it('accepts a valid provider error', () => {
      const result = ProviderErrorSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    it('accepts optional cause', () => {
      const result = ProviderErrorSchema.safeParse({
        ...validError,
        cause: new Error('underlying'),
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty code', () => {
      const result = ProviderErrorSchema.safeParse({
        ...validError,
        code: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty message', () => {
      const result = ProviderErrorSchema.safeParse({
        ...validError,
        message: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ContentIdentitySchema', () => {
    const validIdentity = {
      uri: 'https://example.com/doc',
      hash: createContentHash('test'),
      discoveredAt: createTimestamp(),
    };

    it('accepts a valid content identity', () => {
      const result = ContentIdentitySchema.safeParse(validIdentity);
      expect(result.success).toBe(true);
    });

    it('accepts optional version', () => {
      const result = ContentIdentitySchema.safeParse({
        ...validIdentity,
        version: '1.2.3',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty uri', () => {
      const result = ContentIdentitySchema.safeParse({
        ...validIdentity,
        uri: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty version', () => {
      const result = ContentIdentitySchema.safeParse({
        ...validIdentity,
        version: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DiscoveryScopeSchema', () => {
    it('accepts a fully populated scope', () => {
      const result = DiscoveryScopeSchema.safeParse({
        maxDepth: 3,
        maxItems: 100,
        include: ['*.ts'],
        exclude: ['node_modules'],
        since: createTimestamp(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts an empty scope', () => {
      const result = DiscoveryScopeSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects non-positive maxDepth', () => {
      const result = DiscoveryScopeSchema.safeParse({ maxDepth: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects non-positive maxItems', () => {
      const result = DiscoveryScopeSchema.safeParse({ maxItems: -1 });
      expect(result.success).toBe(false);
    });
  });
});
