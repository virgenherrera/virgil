import { ProviderCapability, ProviderStatus } from './provider.types.js';

describe('ProviderCapability', () => {
  it('declares exactly the capability categories providers may advertise', () => {
    expect(Object.values(ProviderCapability).sort()).toEqual(
      [
        'knowledge',
        'issue',
        'repository',
        'chat',
        'embedding',
        'vector_store',
        'retriever',
      ].sort(),
    );
  });
});

describe('ProviderStatus', () => {
  it('declares exactly the connection lifecycle states', () => {
    expect(Object.values(ProviderStatus).sort()).toEqual(
      [
        'registered',
        'configured',
        'connected',
        'degraded',
        'disconnected',
      ].sort(),
    );
  });
});
