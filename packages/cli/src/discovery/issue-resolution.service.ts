import { Inject, Injectable } from '@nestjs/common';
import type { IssueProvider } from '../contracts/issue-provider.types.js';
import type { NormalisedIssue } from '../contracts/issue-provider.types.js';
import { DISCOVERY_ISSUE_PROVIDER } from './discovery.constants.js';

/**
 * Accepts an issue identifier and resolves it through the configured
 * IssueProvider into a normalized representation (D1).
 *
 * Does not cache the raw issue indefinitely; the resolved representation
 * is input to the discovery pipeline, not a permanent knowledge artifact.
 */
@Injectable()
export class IssueResolutionService {
  constructor(
    @Inject(DISCOVERY_ISSUE_PROVIDER)
    private readonly issueProvider: IssueProvider,
  ) {}

  /**
   * Resolves an issue identifier to a normalised issue via the configured
   * IssueProvider. Throws when the provider cannot resolve the identifier.
   */
  async resolve(issueId: string): Promise<NormalisedIssue> {
    return this.issueProvider.getIssue(issueId);
  }
}
