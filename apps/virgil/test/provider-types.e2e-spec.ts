import {
  ProviderCapability,
  ProviderStatus,
} from '../src/shared/provider.types.js';

describe('provider types', () => {
  describe('ProviderCapability', () => {
    it('exposes all expected capability values', () => {
      expect(ProviderCapability.KNOWLEDGE).toBe('knowledge');
      expect(ProviderCapability.ISSUE).toBe('issue');
      expect(ProviderCapability.REPOSITORY).toBe('repository');
      expect(ProviderCapability.CHAT).toBe('chat');
      expect(ProviderCapability.EMBEDDING).toBe('embedding');
      expect(ProviderCapability.VECTOR_STORE).toBe('vector_store');
      expect(ProviderCapability.RETRIEVER).toBe('retriever');
    });

    it('contains exactly seven members', () => {
      const values = Object.values(ProviderCapability);
      expect(values).toHaveLength(7);
    });
  });

  describe('ProviderStatus', () => {
    it('exposes all expected status values', () => {
      expect(ProviderStatus.REGISTERED).toBe('registered');
      expect(ProviderStatus.CONFIGURED).toBe('configured');
      expect(ProviderStatus.CONNECTED).toBe('connected');
      expect(ProviderStatus.DEGRADED).toBe('degraded');
      expect(ProviderStatus.DISCONNECTED).toBe('disconnected');
    });

    it('contains exactly five members', () => {
      const values = Object.values(ProviderStatus);
      expect(values).toHaveLength(5);
    });
  });
});
