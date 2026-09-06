export class LocalRepoError extends Error {
  constructor(
    readonly repoPath: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LocalRepoError';
  }
}
