export interface RepoInfo {
  readonly ref: string;
  readonly path: string;
  readonly name: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly uncommittedChanges: number;
  readonly recentCommits: readonly CommitBrief[];
}

export interface CommitBrief {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
}

export type SourceCodeSnapshot = readonly RepoInfo[];
