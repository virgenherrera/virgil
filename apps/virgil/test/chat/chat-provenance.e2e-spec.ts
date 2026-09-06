import { ZodError } from 'zod';
import { ChatProvenanceSchema } from '../../src/chat/chat-provenance.schema.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';

describe('ChatProvenanceSchema', () => {
  const validProvenance = () => ({
    providerId: 'slack-chat',
    channelId: 'C01',
    channelName: 'general',
    threadId: 'C01:1234567890.123456',
    messageId: 'msg-1',
    authorId: 'U01',
    authorName: 'Alice',
    timestamp: createTimestamp(),
    permalink: 'https://slack.com/archives/C01/p1234567890',
    contentHash: createContentHash('hello'),
    retrievedAt: createTimestamp(),
  });

  it('accepts a fully populated provenance object', () => {
    const result = ChatProvenanceSchema.parse(validProvenance());
    expect(result.providerId).toBe('slack-chat');
    expect(result.channelId).toBe('C01');
    expect(result.messageId).toBe('msg-1');
  });

  it('allows optional channelName, threadId, and authorName', () => {
    const { channelName, threadId, authorName, ...minimal } = validProvenance();
    const result = ChatProvenanceSchema.parse(minimal);
    expect(result.channelName).toBeUndefined();
    expect(result.threadId).toBeUndefined();
    expect(result.authorName).toBeUndefined();
  });

  it('rejects empty providerId', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), providerId: '' }),
    ).toThrow(ZodError);
  });

  it('rejects empty channelId', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), channelId: '' }),
    ).toThrow(ZodError);
  });

  it('rejects empty messageId', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), messageId: '' }),
    ).toThrow(ZodError);
  });

  it('rejects empty authorId', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), authorId: '' }),
    ).toThrow(ZodError);
  });

  it('rejects empty permalink', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), permalink: '' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid contentHash', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), contentHash: 'bad' }),
    ).toThrow(ZodError);
  });

  it('rejects negative timestamp', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), timestamp: -1 }),
    ).toThrow(ZodError);
  });

  it('rejects non-integer timestamp', () => {
    expect(() =>
      ChatProvenanceSchema.parse({ ...validProvenance(), timestamp: 1.5 }),
    ).toThrow(ZodError);
  });
});
