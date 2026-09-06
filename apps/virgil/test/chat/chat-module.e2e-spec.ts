import { Test } from '@nestjs/testing';
import { ChatModule } from '../../src/chat/chat.module.js';
import { ChatProviderFactory } from '../../src/chat/chat-provider.factory.js';
import { TargetedDiscoveryService } from '../../src/chat/targeted-discovery.service.js';

describe('ChatModule', () => {
  it('provides ChatProviderFactory', async () => {
    const module = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();

    const factory = module.get(ChatProviderFactory);
    expect(factory).toBeDefined();
    expect(factory).toBeInstanceOf(ChatProviderFactory);
  });

  it('provides TargetedDiscoveryService', async () => {
    const module = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();

    const service = module.get(TargetedDiscoveryService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(TargetedDiscoveryService);
  });

  it('exports ChatProviderFactory for consuming modules', async () => {
    const module = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();

    expect(() => module.get(ChatProviderFactory)).not.toThrow();
  });

  it('exports TargetedDiscoveryService for consuming modules', async () => {
    const module = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();

    expect(() => module.get(TargetedDiscoveryService)).not.toThrow();
  });
});
