import type { IssueReference } from '../contracts/issue-provider.types.js';

export interface DiscoveryHint {
  readonly kind: 'issue' | 'pull_request' | 'user' | 'label' | 'milestone' | 'repository';
  readonly uri: string;
  readonly label?: string;
}

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

  const assignee = metadata['assignee'] as string | undefined;
  if (assignee && owner) {
    addHint({ kind: 'user', uri: `${baseUrl}/${assignee}`, label: assignee });
  }

  const author = metadata['author'] as string | null | undefined;
  if (author) {
    addHint({ kind: 'user', uri: `${baseUrl}/${author}`, label: author });
  }

  const milestone = metadata['milestone'] as string | null | undefined;
  if (milestone && owner && repo) {
    addHint({ kind: 'milestone', uri: `${baseUrl}/${owner}/${repo}/milestone`, label: milestone });
  }

  return hints;
}
