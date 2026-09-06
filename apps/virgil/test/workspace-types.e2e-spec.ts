import {
  WorkspaceIdSchema,
  ProviderRegistrationSchema,
  WorkspaceConfigSchema,
} from '../src/shared/workspace.types.js';

describe('workspace types', () => {
  describe('WorkspaceIdSchema', () => {
    it('accepts a non-empty string', () => {
      const result = WorkspaceIdSchema.safeParse('ws-001');
      expect(result.success).toBe(true);
    });

    it('rejects an empty string', () => {
      const result = WorkspaceIdSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('ProviderRegistrationSchema', () => {
    const valid = {
      providerId: 'github',
      capability: 'knowledge',
      configPath: '/etc/virgil/github.json',
    };

    it('accepts a valid registration', () => {
      const result = ProviderRegistrationSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('accepts a registration with credentialRef', () => {
      const result = ProviderRegistrationSchema.safeParse({
        ...valid,
        credentialRef: 'keyring://github-token',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a registration with empty providerId', () => {
      const result = ProviderRegistrationSchema.safeParse({
        ...valid,
        providerId: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a registration with invalid capability', () => {
      const result = ProviderRegistrationSchema.safeParse({
        ...valid,
        capability: 'nonexistent',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a registration with empty configPath', () => {
      const result = ProviderRegistrationSchema.safeParse({
        ...valid,
        configPath: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('WorkspaceConfigSchema', () => {
    const validConfig = {
      id: 'ws-001',
      name: 'My Workspace',
      createdAt: 1_700_000_000_000,
      providers: new Map([
        [
          'github',
          {
            providerId: 'github',
            capability: 'knowledge',
            configPath: '/etc/virgil/github.json',
          },
        ],
      ]),
    };

    it('accepts a valid workspace config', () => {
      const result = WorkspaceConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('accepts a config with an empty providers map', () => {
      const result = WorkspaceConfigSchema.safeParse({
        ...validConfig,
        providers: new Map(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects a config with an empty name', () => {
      const result = WorkspaceConfigSchema.safeParse({
        ...validConfig,
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a config with an empty id', () => {
      const result = WorkspaceConfigSchema.safeParse({
        ...validConfig,
        id: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
