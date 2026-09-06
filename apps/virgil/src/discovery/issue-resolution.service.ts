import { Inject, Injectable } from '@nestjs/common';
import type { IssueProvider, NormalisedIssue } from '../contracts/issue-provider.types.js';
import { DISCOVERY_ISSUE_PROVIDER } from './discovery.constants.js';

@Injectable()
export class IssueResolutionService {
  constructor(@Inject(DISCOVERY_ISSUE_PROVIDER) private readonly issueProvider: IssueProvider) {}

  async resolve(issueId: string): Promise<NormalisedIssue> {
    return this.issueProvider.getIssue(issueId);
  }
}
