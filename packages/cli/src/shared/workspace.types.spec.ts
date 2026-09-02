import { createTimestamp } from './primitives.js';
import { ProviderCapability } from './provider.types.js';
import {
  ProviderRegistrationSchema,
  WorkspaceConfigSchema,
  WorkspaceIdSchema,
} from './workspace.types.js';

describe('WorkspaceIdSchema', () => {
  it('accepts a non-empty string', () => {
    expect(WorkspaceIdSchema.safeParse('ws-1').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(WorkspaceIdSchema.safeParse('').success).toBe(false);
  });
});

describe('ProviderRegistrationSchema', () => {
  const valid = {
    providerId: 'openai',
    capability: ProviderCapability.CHAT,
    configPath: '/config/openai.json',
  };

  it('accepts a valid registration without a credential ref', () => {
    expect(ProviderRegistrationSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid registration with a credential ref', () => {
    const result = ProviderRegistrationSchema.safeParse({
      ...valid,
      credentialRef: 'keychain:openai',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown capability', () => {
    const result = ProviderRegistrationSchema.safeParse({
      ...valid,
      capability: 'not-a-capability',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty providerId', () => {
    const result = ProviderRegistrationSchema.safeParse({
      ...valid,
      providerId: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('WorkspaceConfigSchema', () => {
  it('accepts a valid workspace config', () => {
    const providers = new Map([
      [
        'openai',
        {
          providerId: 'openai',
          capability: ProviderCapability.CHAT,
          configPath: '/config/openai.json',
        },
      ],
    ]);

    const result = WorkspaceConfigSchema.safeParse({
      id: 'ws-1',
      name: 'Default workspace',
      createdAt: createTimestamp(),
      providers,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty workspace name', () => {
    const result = WorkspaceConfigSchema.safeParse({
      id: 'ws-1',
      name: '',
      createdAt: createTimestamp(),
      providers: new Map(),
    });

    expect(result.success).toBe(false);
  });
});
