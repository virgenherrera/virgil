import type { IssueReference } from '../contracts/issue-provider.types.js';

/**
 * A progressive-discovery hint extracted from a GitHub issue. Hints point
 * to related entities (issues, PRs, documents, users, labels, milestones)
 * that a discovery orchestrator (H08) can follow to expand the knowledge
 * graph incrementally.
 */
export interface DiscoveryHint {
  readonly kind:
    'issue' | 'pull_request' | 'user' | 'label' | 'milestone' | 'repository';
  readonly uri: string;
  readonly label?: string;
}

/**
 * Extracts progressive-discovery hints from a normalised issue's metadata
 * and cross-references. Hints are deduplicated by URI so the discovery
 * orchestrator does not re-crawl the same entity.
 *
 * Sources of hints:
 * 1. Cross-references extracted by the field normaliser (issues, PRs)
 * 2. Assignee (user profile)
 * 3. Author (user profile)
 * 4. Labels (label search pages)
 * 5. Milestone (milestone page)
 */
export function extractDiscoveryHints(
  references: readonly IssueReference[],
  metadata: Readonly<Record<string, unknown>>,
): readonly DiscoveryHint[] {
  const seen = new Set<string>();
  const hints: DiscoveryHint[] = [];

  function addHint(hint: DiscoveryHint): void {
    if (!seen.has(hint.uri)) {
      seen.add(hint.uri);
      hints.push(hint);
    }
  }

  // 1. Cross-references from the issue body
  for (const ref of references) {
    addHint({
      kind: ref.type === 'pull_request' ? 'pull_request' : 'issue',
      uri: ref.uri,
      label: ref.label,
    });
  }

  const owner = metadata['owner'] as string | undefined;
  const repo = metadata['repo'] as string | undefined;
  const baseUrl = 'https://github.com';

  // 2. Assignee hint
  const assignee = metadata['assignee'] as string | undefined;
  if (assignee && owner) {
    addHint({
      kind: 'user',
      uri: `${baseUrl}/${assignee}`,
      label: assignee,
    });
  }

  // 3. Author hint
  const author = metadata['author'] as string | null | undefined;
  if (author) {
    addHint({
      kind: 'user',
      uri: `${baseUrl}/${author}`,
      label: author,
    });
  }

  // 4. Milestone hint
  const milestone = metadata['milestone'] as string | null | undefined;
  if (milestone && owner && repo) {
    addHint({
      kind: 'milestone',
      uri: `${baseUrl}/${owner}/${repo}/milestone`,
      label: milestone,
    });
  }

  return hints;
}
