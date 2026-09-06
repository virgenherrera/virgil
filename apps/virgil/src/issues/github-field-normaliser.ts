import type { ContentIdentity } from '../contracts/common.types.js';
import {
  IssueReferenceType,
  IssueStatus,
  type IssueReference,
  type NormalisedIssue,
} from '../contracts/issue-provider.types.js';
import { createContentHash, createTimestamp } from '../shared/primitives.js';
import type { GitHubIssue } from './github-api-response.schema.js';

export function mapGitHubState(
  state: 'open' | 'closed',
  stateReason?: 'completed' | 'not_planned' | 'reopened' | null,
): IssueStatus {
  if (state === 'closed') {
    if (stateReason === 'completed') return IssueStatus.DONE;
    return IssueStatus.CLOSED;
  }
  return IssueStatus.OPEN;
}

export function extractReferencesFromBody(
  body: string | null | undefined,
  selfOwner: string,
  selfRepo: string,
): IssueReference[] {
  if (!body) return [];
  const refs: IssueReference[] = [];
  const seen = new Set<string>();

  const urlPattern = /https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/(issues|pull)\/(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(body)) !== null) {
    const [url, , , kind] = match;
    const type = kind === 'pull' ? IssueReferenceType.PULL_REQUEST : IssueReferenceType.ISSUE;
    if (!seen.has(url)) {
      seen.add(url);
      refs.push({ type, uri: url });
    }
  }

  const shortPattern = /(?:([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+))?#(\d+)/g;
  while ((match = shortPattern.exec(body)) !== null) {
    const owner = match[1] ?? selfOwner;
    const repo = match[2] ?? selfRepo;
    const num = match[3];
    const uri = `https://github.com/${owner}/${repo}/issues/${num}`;
    if (!seen.has(uri)) {
      seen.add(uri);
      refs.push({ type: IssueReferenceType.ISSUE, uri });
    }
  }

  return refs;
}

export function extractLabelNames(labels: ReadonlyArray<string | { name: string }>): string[] {
  return labels.map((label) => (typeof label === 'string' ? label : label.name));
}

function buildIdentity(issue: GitHubIssue): ContentIdentity {
  const content = `${issue.title}\n${issue.body ?? ''}`;
  return {
    uri: issue.html_url,
    hash: createContentHash(content),
    version: issue.updated_at,
    discoveredAt: createTimestamp(),
  };
}

export function normaliseGitHubIssue(issue: GitHubIssue, owner: string, repo: string): NormalisedIssue {
  const pullRequestRef: IssueReference | undefined = issue.pull_request
    ? { type: IssueReferenceType.PULL_REQUEST, uri: issue.pull_request.html_url, label: `PR for #${issue.number}` }
    : undefined;

  const bodyRefs = extractReferencesFromBody(issue.body, owner, repo);
  const references = pullRequestRef ? [pullRequestRef, ...bodyRefs] : bodyRefs;

  return {
    id: `github:${owner}/${repo}#${issue.number}`,
    externalId: String(issue.id),
    title: issue.title,
    description: issue.body ?? '',
    status: mapGitHubState(issue.state, issue.state_reason),
    assignee: issue.assignee?.login,
    labels: extractLabelNames(issue.labels),
    references,
    identity: buildIdentity(issue),
    metadata: {
      owner, repo,
      number: issue.number,
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at ?? null,
      milestone: issue.milestone?.title ?? null,
      author: issue.user?.login ?? null,
      assignee: issue.assignee?.login ?? null,
    },
  };
}
