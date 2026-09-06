import { Injectable } from '@nestjs/common';
import type { NormalisedIssue } from '../contracts/issue-provider.types.js';
import { IssueReferenceType } from '../contracts/issue-provider.types.js';
import type { DiscoveryIntent, IntentElement } from './discovery.schemas.js';

/**
 * Issue reference pattern matchers used by intent extraction.
 */
const ISSUE_KEY_PATTERN = /\b([A-Z]{2,10}-\d+|GH-\d+|#\d+)\b/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const PATH_PATTERN = /(?:^|\s)((?:src|lib|packages|docs)\/[\w/.-]+)/g;
const CHANNEL_PATTERN = /#([a-z][\w-]*)/g;

/**
 * Derives structured discovery intent from a resolved issue (D2).
 *
 * Uses configurable extraction strategies: keyword extraction, reference
 * pattern matching (URL patterns, issue-key patterns, path patterns),
 * and label-based classification.
 */
@Injectable()
export class IntentExtractionService {
  /**
   * Extracts a discovery intent from the given normalised issue.
   */
  extract(issue: NormalisedIssue): DiscoveryIntent {
    const elements: IntentElement[] = [];
    const seenKeys = new Set<string>();

    const addElement = (element: IntentElement): void => {
      if (!seenKeys.has(element.key)) {
        seenKeys.add(element.key);
        elements.push(element);
      }
    };

    // Extract components from labels
    for (const label of issue.labels) {
      addElement({
        key: `label:${label}`,
        category: 'component',
        description: `Component or area identified by label "${label}"`,
        value: label,
      });
    }

    // Extract references from issue references
    for (const ref of issue.references) {
      switch (ref.type) {
        case IssueReferenceType.ISSUE:
          addElement({
            key: `issue-ref:${ref.uri}`,
            category: 'related-issue',
            description: `Related issue: ${ref.label ?? ref.uri}`,
            value: ref.uri,
          });
          break;
        case IssueReferenceType.DOCUMENT:
          addElement({
            key: `doc-ref:${ref.uri}`,
            category: 'documentation',
            description: `Referenced document: ${ref.label ?? ref.uri}`,
            value: ref.uri,
          });
          break;
        case IssueReferenceType.PULL_REQUEST:
          addElement({
            key: `pr-ref:${ref.uri}`,
            category: 'related-issue',
            description: `Related pull request: ${ref.label ?? ref.uri}`,
            value: ref.uri,
          });
          break;
      }
    }

    const fullText = `${issue.title} ${issue.description}`;

    // Extract issue keys from text
    for (const match of fullText.matchAll(ISSUE_KEY_PATTERN)) {
      const key = match[1];
      addElement({
        key: `issue-key:${key}`,
        category: 'related-issue',
        description: `Issue key mentioned in text: ${key}`,
        value: key,
      });
    }

    // Extract URLs from text
    for (const match of fullText.matchAll(URL_PATTERN)) {
      const url = match[0];
      addElement({
        key: `url:${url}`,
        category: 'documentation',
        description: `URL referenced in issue: ${url}`,
        value: url,
      });
    }

    // Extract file paths from text
    for (const match of fullText.matchAll(PATH_PATTERN)) {
      const path = match[1];
      addElement({
        key: `path:${path}`,
        category: 'architectural-area',
        description: `File path referenced in issue: ${path}`,
        value: path,
      });
    }

    // Extract channel references from text
    for (const match of fullText.matchAll(CHANNEL_PATTERN)) {
      const channel = match[1];
      // Skip labels already captured as component elements
      if (!seenKeys.has(`label:${channel}`)) {
        addElement({
          key: `channel:${channel}`,
          category: 'conversation',
          description: `Chat channel mentioned: #${channel}`,
          value: channel,
        });
      }
    }

    // If no elements were extracted, add a general intent from the title
    if (elements.length === 0) {
      addElement({
        key: `title:${issue.id}`,
        category: 'component',
        description: `General context for: ${issue.title}`,
        value: issue.title,
      });
    }

    return {
      issueId: issue.id,
      elements,
    };
  }
}
