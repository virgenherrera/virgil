import { IssueReferenceType, IssueStatus } from '../../src/contracts/issue-provider.types.js';
import type { GitHubIssue } from '../../src/issues/github-api-response.schema.js';
import {
  extractLabelNames,
  extractReferencesFromBody,
  mapGitHubState,
  normaliseGitHubIssue,
} from '../../src/issues/github-field-normaliser.js';

function makeGitHubIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Test issue',
    body: 'Test body',
    state: 'open',
    state_reason: null,
    html_url: 'https://github.com/owner/repo/issues/42',
    user: { login: 'testuser', id: 1, html_url: 'https://github.com/testuser' },
    assignee: null,
    labels: [],
    milestone: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

describe('mapGitHubState', () => {
  it('maps open to OPEN', () => {
    expect(mapGitHubState('open')).toBe(IssueStatus.OPEN);
  });

  it('maps closed to CLOSED', () => {
    expect(mapGitHubState('closed')).toBe(IssueStatus.CLOSED);
  });

  it('maps closed + completed to DONE', () => {
    expect(mapGitHubState('closed', 'completed')).toBe(IssueStatus.DONE);
  });

  it('maps closed + not_planned to CLOSED', () => {
    expect(mapGitHubState('closed', 'not_planned')).toBe(IssueStatus.CLOSED);
  });

  it('maps closed + reopened to CLOSED', () => {
    expect(mapGitHubState('closed', 'reopened')).toBe(IssueStatus.CLOSED);
  });

  it('maps open + null to OPEN', () => {
    expect(mapGitHubState('open', null)).toBe(IssueStatus.OPEN);
  });
});

describe('extractReferencesFromBody', () => {
  it('returns empty array for null body', () => {
    expect(extractReferencesFromBody(null, 'owner', 'repo')).toEqual([]);
  });

  it('returns empty array for undefined body', () => {
    expect(extractReferencesFromBody(undefined, 'owner', 'repo')).toEqual([]);
  });

  it('returns empty array for empty body', () => {
    expect(extractReferencesFromBody('', 'owner', 'repo')).toEqual([]);
  });

  it('extracts full issue URLs', () => {
    const body = 'See https://github.com/owner/repo/issues/10 for details';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      type: IssueReferenceType.ISSUE,
      uri: 'https://github.com/owner/repo/issues/10',
    });
  });

  it('extracts full pull request URLs', () => {
    const body = 'Fixed in https://github.com/owner/repo/pull/5';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      type: IssueReferenceType.PULL_REQUEST,
      uri: 'https://github.com/owner/repo/pull/5',
    });
  });

  it('extracts #N shorthand references', () => {
    const body = 'Related to #7 and #8';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(2);
    expect(refs[0].uri).toBe('https://github.com/owner/repo/issues/7');
    expect(refs[1].uri).toBe('https://github.com/owner/repo/issues/8');
  });

  it('extracts owner/repo#N references', () => {
    const body = 'See other/project#15';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(1);
    expect(refs[0].uri).toBe('https://github.com/other/project/issues/15');
  });

  it('deduplicates references', () => {
    const body = 'See https://github.com/owner/repo/issues/10 and also https://github.com/owner/repo/issues/10 again';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(1);
  });

  it('deduplicates URL and shorthand for same issue', () => {
    const body = 'See https://github.com/owner/repo/issues/10 and #10';
    const refs = extractReferencesFromBody(body, 'owner', 'repo');
    expect(refs).toHaveLength(1);
  });
});

describe('extractLabelNames', () => {
  it('extracts names from string labels', () => {
    expect(extractLabelNames(['bug', 'feature'])).toEqual(['bug', 'feature']);
  });

  it('extracts names from object labels', () => {
    expect(extractLabelNames([{ name: 'bug' }, { name: 'feature' }])).toEqual(['bug', 'feature']);
  });

  it('handles mixed labels', () => {
    expect(extractLabelNames(['bug', { name: 'feature' }])).toEqual(['bug', 'feature']);
  });
});

describe('normaliseGitHubIssue', () => {
  it('normalises a full issue', () => {
    const issue = makeGitHubIssue({
      assignee: { login: 'dev', id: 2, html_url: 'https://github.com/dev' },
      labels: [{ id: 1, name: 'bug' }],
      milestone: { id: 1, number: 1, title: 'v1.0', state: 'open', html_url: 'https://github.com/owner/repo/milestone/1' },
    });
    const result = normaliseGitHubIssue(issue, 'owner', 'repo');
    expect(result.id).toBe('github:owner/repo#42');
    expect(result.externalId).toBe('1');
    expect(result.title).toBe('Test issue');
    expect(result.description).toBe('Test body');
    expect(result.status).toBe(IssueStatus.OPEN);
    expect(result.assignee).toBe('dev');
    expect(result.labels).toEqual(['bug']);
    expect(result.identity.uri).toBe('https://github.com/owner/repo/issues/42');
    expect(result.metadata['owner']).toBe('owner');
    expect(result.metadata['repo']).toBe('repo');
    expect(result.metadata['milestone']).toBe('v1.0');
  });

  it('includes pull_request reference when present', () => {
    const issue = makeGitHubIssue({
      pull_request: {
        url: 'https://api.github.com/repos/owner/repo/pulls/42',
        html_url: 'https://github.com/owner/repo/pull/42',
      },
    });
    const result = normaliseGitHubIssue(issue, 'owner', 'repo');
    expect(result.references).toHaveLength(1);
    expect(result.references[0].type).toBe(IssueReferenceType.PULL_REQUEST);
    expect(result.references[0].label).toBe('PR for #42');
  });

  it('handles issue without body', () => {
    const issue = makeGitHubIssue({ body: null });
    const result = normaliseGitHubIssue(issue, 'owner', 'repo');
    expect(result.description).toBe('');
  });

  it('handles issue without assignee', () => {
    const issue = makeGitHubIssue({ assignee: null });
    const result = normaliseGitHubIssue(issue, 'owner', 'repo');
    expect(result.assignee).toBeUndefined();
  });
});
