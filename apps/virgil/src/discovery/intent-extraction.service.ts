import { Injectable } from '@nestjs/common';
import type { NormalisedIssue } from '../contracts/issue-provider.types.js';
import { IssueReferenceType } from '../contracts/issue-provider.types.js';
import type { DiscoveryIntent, IntentElement } from './discovery.schemas.js';

const ISSUE_KEY_PATTERN = /\b([A-Z]{2,10}-\d+|GH-\d+|#\d+)\b/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const PATH_PATTERN = /(?:^|\s)((?:src|lib|packages|docs)\/[\w/.-]+)/g;
const CHANNEL_PATTERN = /#([a-z][\w-]*)/g;

@Injectable()
export class IntentExtractionService {
  extract(issue: NormalisedIssue): DiscoveryIntent {
    const elements: IntentElement[] = [];
    const seenKeys = new Set<string>();

    const addElement = (element: IntentElement): void => {
      if (!seenKeys.has(element.key)) {
        seenKeys.add(element.key);
        elements.push(element);
      }
    };

    for (const label of issue.labels) {
      addElement({ key: `label:${label}`, category: 'component', description: `Component or area identified by label "${label}"`, value: label });
    }

    for (const ref of issue.references) {
      switch (ref.type) {
        case IssueReferenceType.ISSUE:
          addElement({ key: `issue-ref:${ref.uri}`, category: 'related-issue', description: `Related issue: ${ref.label ?? ref.uri}`, value: ref.uri });
          break;
        case IssueReferenceType.DOCUMENT:
          addElement({ key: `doc-ref:${ref.uri}`, category: 'documentation', description: `Referenced document: ${ref.label ?? ref.uri}`, value: ref.uri });
          break;
        case IssueReferenceType.PULL_REQUEST:
          addElement({ key: `pr-ref:${ref.uri}`, category: 'related-issue', description: `Related pull request: ${ref.label ?? ref.uri}`, value: ref.uri });
          break;
      }
    }

    const fullText = `${issue.title} ${issue.description}`;

    for (const match of fullText.matchAll(ISSUE_KEY_PATTERN)) {
      addElement({ key: `issue-key:${match[1]}`, category: 'related-issue', description: `Issue key mentioned in text: ${match[1]}`, value: match[1] });
    }

    for (const match of fullText.matchAll(URL_PATTERN)) {
      addElement({ key: `url:${match[0]}`, category: 'documentation', description: `URL referenced in issue: ${match[0]}`, value: match[0] });
    }

    for (const match of fullText.matchAll(PATH_PATTERN)) {
      addElement({ key: `path:${match[1]}`, category: 'architectural-area', description: `File path referenced in issue: ${match[1]}`, value: match[1] });
    }

    for (const match of fullText.matchAll(CHANNEL_PATTERN)) {
      if (!seenKeys.has(`label:${match[1]}`)) {
        addElement({ key: `channel:${match[1]}`, category: 'conversation', description: `Chat channel mentioned: #${match[1]}`, value: match[1] });
      }
    }

    if (elements.length === 0) {
      addElement({ key: `title:${issue.id}`, category: 'component', description: `General context for: ${issue.title}`, value: issue.title });
    }

    return { issueId: issue.id, elements };
  }
}
