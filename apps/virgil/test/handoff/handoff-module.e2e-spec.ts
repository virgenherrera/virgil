import { Test } from '@nestjs/testing';
import { HandoffProtocolModule } from '../../src/handoff/handoff-protocol.module.js';
import { HandoffProtocolFactory } from '../../src/handoff/handoff-protocol.service.js';

describe('HandoffProtocolModule', () => {
  it('provides HandoffProtocolFactory via DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HandoffProtocolModule],
    }).compile();

    const factory = moduleRef.get(HandoffProtocolFactory);
    expect(factory).toBeInstanceOf(HandoffProtocolFactory);
  });

  it('exports HandoffProtocolFactory for other modules', async () => {
    const consumerModule = await Test.createTestingModule({
      imports: [HandoffProtocolModule],
    }).compile();

    const factory = consumerModule.get(HandoffProtocolFactory);
    expect(factory).toBeDefined();
    expect(typeof factory.create).toBe('function');
    expect(typeof factory.validate).toBe('function');
    expect(typeof factory.transition).toBe('function');
    expect(typeof factory.serialize).toBe('function');
    expect(typeof factory.deserialize).toBe('function');
  });
});
