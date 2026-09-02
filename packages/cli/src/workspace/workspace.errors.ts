/** A config file (or CLI input) failed JSON parsing or Zod validation. */
export class WorkspaceConfigValidationError extends Error {
  constructor(
    public readonly context: string,
    public readonly issues: readonly string[],
  ) {
    super(`Invalid configuration at ${context}: ${issues.join('; ')}`);
    this.name = 'WorkspaceConfigValidationError';
  }
}

/** `workspace create` was called with a slug that already exists. */
export class DuplicateWorkspaceError extends Error {
  constructor(public readonly slug: string) {
    super(`Workspace "${slug}" already exists.`);
    this.name = 'DuplicateWorkspaceError';
  }
}

/** A command referenced a workspace slug that has no on-disk workspace. */
export class WorkspaceNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(
      `Workspace "${slug}" was not found. Run "virgil workspace list" to see available workspaces.`,
    );
    this.name = 'WorkspaceNotFoundError';
  }
}

/** A command required an active workspace but none is selected. */
export class NoActiveWorkspaceError extends Error {
  constructor() {
    super(
      'No active workspace is selected. Run "virgil workspace create <slug>" or "virgil workspace select <slug>" first.',
    );
    this.name = 'NoActiveWorkspaceError';
  }
}

/** A repository path was already registered within the target workspace. */
export class DuplicateRepoError extends Error {
  constructor(
    public readonly path: string,
    public readonly slug: string,
  ) {
    super(
      `Repository path "${path}" is already registered in workspace "${slug}".`,
    );
    this.name = 'DuplicateRepoError';
  }
}
