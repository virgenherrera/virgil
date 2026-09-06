import { IssueReferenceType } from '../../src/contracts/issue-provider.types.js';
import type { IssueReference } from '../../src/contracts/issue-provider.types.js';
import { extractDiscoveryHints } from '../../src/issues/github-discovery-hints.js';

describe('extractDiscoveryHints', () => {
  it('extracts hints from issue references', () => {
    const refs: IssueReference[] = [
      { type: IssueReferenceType.ISSUE, uri: 'https://github.com/owner/repo/issues/10' },
    ];
    const hints = extractDiscoveryHints(refs, { owner: 'owner', repo: 'repo' });
    expect(hints).toContainEqual({
      kind: 'issue',
      uri: 'https://github.com/owner/repo/issues/10',
      label: undefined,
    });
  });

  it('extracts hints from PR references', () => {
    const refs: IssueReference[] = [
      { type: IssueReferenceType.PULL_REQUEST, uri: 'https://github.com/owner/repo/pull/5', label: 'PR #5' },
    ];
    const hints = extractDiscoveryHints(refs, { owner: 'owner', repo: 'repo' });
    expect(hints).toContainEqual({
      kind: 'pull_request',
      uri: 'https://github.com/owner/repo/pull/5',
      label: 'PR #5',
    });
  });

  it('extracts assignee hint', () => {
    const hints = extractDiscoveryHints([], {
      owner: 'owner',
      repo: 'repo',
      assignee: 'devuser',
      author: null,
    });
    expect(hints).toContainEqual({
      kind: 'user',
      uri: 'https://github.com/devuser',
      label: 'devuser',
    });
  });

  it('extracts author hint', () => {
    const hints = extractDiscoveryHints([], {
      owner: 'owner',
      repo: 'repo',
      author: 'authoruser',
    });
    expect(hints).toContainEqual({
      kind: 'user',
      uri: 'https://github.com/authoruser',
      label: 'authoruser',
    });
  });

  it('extracts milestone hint', () => {
    const hints = extractDiscoveryHints([], {
      owner: 'owner',
      repo: 'repo',
      milestone: 'v1.0',
    });
    expect(hints).toContainEqual({
      kind: 'milestone',
      uri: 'https://github.com/owner/repo/milestone',
      label: 'v1.0',
    });
  });

  it('deduplicates by URI', () => {
    const refs: IssueReference[] = [
      { type: IssueReferenceType.ISSUE, uri: 'https://github.com/owner/repo/issues/10' },
      { type: IssueReferenceType.ISSUE, uri: 'https://github.com/owner/repo/issues/10' },
    ];
    const hints = extractDiscoveryHints(refs, { owner: 'owner', repo: 'repo' });
    const issueHints = hints.filter((h) => h.kind === 'issue');
    expect(issueHints).toHaveLength(1);
  });

  it('returns empty array for no references and no metadata', () => {
    const hints = extractDiscoveryHints([], {});
    expect(hints).toEqual([]);
  });

  it('skips milestone hint when owner/repo missing', () => {
    const hints = extractDiscoveryHints([], { milestone: 'v1.0' });
    const milestoneHints = hints.filter((h) => h.kind === 'milestone');
    expect(milestoneHints).toHaveLength(0);
  });
});
