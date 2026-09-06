import { IntentExtractionService } from '../../src/discovery/intent-extraction.service.js';
import type { NormalisedIssue } from '../../src/contracts/issue-provider.types.js';
import { IssueReferenceType, IssueStatus } from '../../src/contracts/issue-provider.types.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';

function makeIssue(overrides: Partial<NormalisedIssue> = {}): NormalisedIssue {
  return {
    id: 'PROJ-1',
    externalId: 'ext-1',
    title: 'Test issue',
    description: '',
    status: IssueStatus.OPEN,
    labels: [],
    references: [],
    identity: { uri: 'issue://PROJ-1', hash: createContentHash('PROJ-1'), discoveredAt: createTimestamp() },
    metadata: {},
    ...overrides,
  };
}

describe('IntentExtractionService', () => {
  let service: IntentExtractionService;

  beforeEach(() => {
    service = new IntentExtractionService();
  });

  it('extracts labels as component elements', () => {
    const issue = makeIssue({ labels: ['auth', 'security'] });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'label:auth', category: 'component' }),
      expect.objectContaining({ key: 'label:security', category: 'component' }),
    ]));
  });

  it('extracts issue references', () => {
    const issue = makeIssue({
      references: [{ type: IssueReferenceType.ISSUE, uri: 'issue://OTHER-1', label: 'Other issue' }],
    });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'issue-ref:issue://OTHER-1', category: 'related-issue' }),
    ]));
  });

  it('extracts document references', () => {
    const issue = makeIssue({
      references: [{ type: IssueReferenceType.DOCUMENT, uri: 'doc://readme', label: 'README' }],
    });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'doc-ref:doc://readme', category: 'documentation' }),
    ]));
  });

  it('extracts PR references', () => {
    const issue = makeIssue({
      references: [{ type: IssueReferenceType.PULL_REQUEST, uri: 'pr://42', label: 'PR #42' }],
    });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'pr-ref:pr://42', category: 'related-issue' }),
    ]));
  });

  it('extracts issue keys from text', () => {
    const issue = makeIssue({ title: 'Fix AUTH-123 regression', description: 'Related to GH-456' });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'issue-key:AUTH-123', category: 'related-issue' }),
      expect.objectContaining({ key: 'issue-key:GH-456', category: 'related-issue' }),
    ]));
  });

  it('extracts URLs from text', () => {
    const issue = makeIssue({ description: 'See https://docs.example.com/guide for details' });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'url:https://docs.example.com/guide', category: 'documentation' }),
    ]));
  });

  it('extracts file paths from text', () => {
    const issue = makeIssue({ description: 'Check src/auth/login.service.ts for the bug' });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'path:src/auth/login.service.ts', category: 'architectural-area' }),
    ]));
  });

  it('extracts channel references from text', () => {
    const issue = makeIssue({ description: 'Discussed in #dev-backend' });
    const intent = service.extract(issue);
    expect(intent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'channel:dev-backend', category: 'conversation' }),
    ]));
  });

  it('deduplicates elements by key', () => {
    const issue = makeIssue({
      labels: ['auth'],
      title: 'Auth issue',
      description: 'Label auth again',
    });
    const intent = service.extract(issue);
    const authLabels = intent.elements.filter((e) => e.key === 'label:auth');
    expect(authLabels).toHaveLength(1);
  });

  it('does not add channel when label with same name exists', () => {
    const issue = makeIssue({
      labels: ['backend'],
      description: 'See #backend',
    });
    const intent = service.extract(issue);
    const channelElements = intent.elements.filter((e) => e.key === 'channel:backend');
    expect(channelElements).toHaveLength(0);
  });

  it('falls back to title element when no other elements found', () => {
    const issue = makeIssue({ title: 'Simple bug fix', description: 'No references' });
    const intent = service.extract(issue);
    expect(intent.elements).toHaveLength(1);
    expect(intent.elements[0]).toEqual(expect.objectContaining({
      key: 'title:PROJ-1',
      category: 'component',
      value: 'Simple bug fix',
    }));
  });

  it('sets issueId from issue.id', () => {
    const issue = makeIssue({ id: 'CUSTOM-99' });
    const intent = service.extract(issue);
    expect(intent.issueId).toBe('CUSTOM-99');
  });

  it('uses ref.uri when label is undefined', () => {
    const issue = makeIssue({
      references: [{ type: IssueReferenceType.ISSUE, uri: 'issue://REF-1' }],
    });
    const intent = service.extract(issue);
    const refElement = intent.elements.find((e) => e.key === 'issue-ref:issue://REF-1');
    expect(refElement?.description).toContain('issue://REF-1');
  });
});
