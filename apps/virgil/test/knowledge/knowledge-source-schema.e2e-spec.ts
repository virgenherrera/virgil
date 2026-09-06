import {
  ConfluenceApiSourceSchema,
  ConfluenceCdpSourceSchema,
  LocalFilesystemSourceSchema,
  KnowledgeSourceConfigSchema,
} from '../../src/knowledge/knowledge-source.schema.js';

describe('ConfluenceApiSourceSchema', () => {
  const validConfig = {
    type: 'confluence-api' as const,
    baseUrl: 'https://wiki.example.com',
    email: 'user@example.com',
    apiToken: 'tok-123',
    spaceKey: 'ENG',
  };

  it('accepts valid configuration', () => {
    const result = ConfluenceApiSourceSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('applies default perPage of 25', () => {
    const result = ConfluenceApiSourceSchema.parse(validConfig);
    expect(result.perPage).toBe(25);
  });

  it('rejects invalid baseUrl', () => {
    const result = ConfluenceApiSourceSchema.safeParse({
      ...validConfig,
      baseUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = ConfluenceApiSourceSchema.safeParse({
      ...validConfig,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty apiToken', () => {
    const result = ConfluenceApiSourceSchema.safeParse({
      ...validConfig,
      apiToken: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty spaceKey', () => {
    const result = ConfluenceApiSourceSchema.safeParse({
      ...validConfig,
      spaceKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects perPage exceeding 100', () => {
    const result = ConfluenceApiSourceSchema.safeParse({
      ...validConfig,
      perPage: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfluenceCdpSourceSchema', () => {
  const validConfig = {
    type: 'confluence-cdp' as const,
    baseUrl: 'https://wiki.example.com',
  };

  it('accepts valid configuration', () => {
    const result = ConfluenceCdpSourceSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('applies default browser of chrome', () => {
    const result = ConfluenceCdpSourceSchema.parse(validConfig);
    expect(result.browser).toBe('chrome');
  });

  it('applies default headless of true', () => {
    const result = ConfluenceCdpSourceSchema.parse(validConfig);
    expect(result.headless).toBe(true);
  });

  it('accepts optional profilePath', () => {
    const result = ConfluenceCdpSourceSchema.parse({
      ...validConfig,
      profilePath: '/tmp/profile',
    });
    expect(result.profilePath).toBe('/tmp/profile');
  });

  it('accepts all browser options', () => {
    for (const browser of ['chrome', 'firefox', 'edge', 'safari'] as const) {
      const result = ConfluenceCdpSourceSchema.safeParse({
        ...validConfig,
        browser,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid browser', () => {
    const result = ConfluenceCdpSourceSchema.safeParse({
      ...validConfig,
      browser: 'opera',
    });
    expect(result.success).toBe(false);
  });
});

describe('LocalFilesystemSourceSchema', () => {
  const validConfig = {
    type: 'local-filesystem' as const,
    rootPath: '/data/docs',
  };

  it('accepts valid configuration', () => {
    const result = LocalFilesystemSourceSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('applies default include patterns', () => {
    const result = LocalFilesystemSourceSchema.parse(validConfig);
    expect(result.include).toEqual([
      '**/*.md',
      '**/*.txt',
      '**/*.html',
      '**/*.pdf',
    ]);
  });

  it('applies default exclude patterns', () => {
    const result = LocalFilesystemSourceSchema.parse(validConfig);
    expect(result.exclude).toEqual(['**/node_modules/**', '**/.git/**']);
  });

  it('rejects empty rootPath', () => {
    const result = LocalFilesystemSourceSchema.safeParse({
      ...validConfig,
      rootPath: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('KnowledgeSourceConfigSchema', () => {
  it('discriminates on type field for confluence-api', () => {
    const result = KnowledgeSourceConfigSchema.safeParse({
      type: 'confluence-api',
      baseUrl: 'https://wiki.example.com',
      email: 'user@example.com',
      apiToken: 'tok-123',
      spaceKey: 'ENG',
    });
    expect(result.success).toBe(true);
  });

  it('discriminates on type field for confluence-cdp', () => {
    const result = KnowledgeSourceConfigSchema.safeParse({
      type: 'confluence-cdp',
      baseUrl: 'https://wiki.example.com',
    });
    expect(result.success).toBe(true);
  });

  it('discriminates on type field for local-filesystem', () => {
    const result = KnowledgeSourceConfigSchema.safeParse({
      type: 'local-filesystem',
      rootPath: '/data/docs',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const result = KnowledgeSourceConfigSchema.safeParse({
      type: 'unknown-type',
      baseUrl: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});
