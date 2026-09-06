import type { ContentIdentity } from '../contracts/common.types.js';
import {
  IssueReferenceType,
  IssueStatus,
  type IssueReference,
  type NormalisedIssue,
} from '../contracts/issue-provider.types.js';
import { createContentHash, createTimestamp } from '../shared/primitives.js';
import type { GitHubIssue } from './github-api-response.schema.js';

/**
 * Maps a GitHub REST API issue `state` (plus optional `state_reason`) to a
 * vendor-neutral {@link IssueStatus}.
 *
 * GitHub only exposes two states (`open` / `closed`), so we infer finer
 * lifecycle positions from the `state_reason` field introduced in the REST v3
 * timeline events:
 *
 * - `closed` + `completed` -> {@link IssueStatus.DONE}
 * - `closed` + `not_planned` -> {@link IssueStatus.CLOSED}
 * - `closed` (no reason) -> {@link IssueStatus.CLOSED}
 * - `open` (default) -> {@link IssueStatus.OPEN}
 */
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

/**
 * Extracts cross-references from an issue's body text by matching GitHub-style
 * patterns: `#N`, `owner/repo#N`, and full GitHub URLs pointing to issues or
 * pull requests.
 */
export function extractReferencesFromBody(
  body: string | null | undefined,
  selfOwner: string,
  selfRepo: string,
): IssueReference[] {
  if (!body) return [];

  const refs: IssueReference[] = [];
  const seen = new Set<string>();

  // Full GitHub URLs: https://github.com/owner/repo/issues/123
  const urlPattern =
    /https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/(issues|pull)\/(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(body)) !== null) {
    const [url, , , kind] = match;
    const type =
      kind === 'pull'
        ? IssueReferenceType.PULL_REQUEST
        : IssueReferenceType.ISSUE;
    if (!seen.has(url)) {
      seen.add(url);
      refs.push({ type, uri: url });
    }
  }

  // Short-hand references: owner/repo#N or #N (same repo)
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

/**
 * Extracts label names from the GitHub API's polymorphic label array.
 * Labels can be either string names or full label objects.
 */
export function extractLabelNames(
  labels: ReadonlyArray<string | { name: string }>,
): string[] {
  return labels.map((label) =>
    typeof label === 'string' ? label : label.name,
  );
}

/**
 * Builds a {@link ContentIdentity} for a GitHub issue based on its HTML URL
 * and body content hash.
 */
function buildIdentity(issue: GitHubIssue): ContentIdentity {
  const content = `${issue.title}\n${issue.body ?? ''}`;
  return {
    uri: issue.html_url,
    hash: createContentHash(content),
    version: issue.updated_at,
    discoveredAt: createTimestamp(),
  };
}

/**
 * Pure field normaliser that maps a validated GitHub REST API issue response
 * to the vendor-neutral {@link NormalisedIssue} shape defined by the H04
 * issue-provider contract.
 *
 * This function is intentionally side-effect-free and deterministic (aside
 * from the `discoveredAt` timestamp) so it can be tested in isolation with
 * fixture data.
 */
export function normaliseGitHubIssue(
  issue: GitHubIssue,
  owner: string,
  repo: string,
): NormalisedIssue {
  const pullRequestRef: IssueReference | undefined = issue.pull_request
    ? {
        type: IssueReferenceType.PULL_REQUEST,
        uri: issue.pull_request.html_url,
        label: `PR for #${issue.number}`,
      }
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
      owner,
      repo,
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
