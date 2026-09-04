import { Injectable } from '@nestjs/common';
import type {
  KnowledgeSearchInput,
  KnowledgeSearchOutput,
  KnowledgeStatsOutput,
  KnowledgeCompactOutput,
} from './knowledge.schemas.js';

@Injectable()
export class KnowledgeService {
  search(input: KnowledgeSearchInput): KnowledgeSearchOutput[] {
    return [
      {
        id: 'kb-001',
        title: `Result for "${input.query}" — Auth middleware overview`,
        snippet: 'The auth middleware validates JWT tokens before routing.',
        score: 0.95,
        source: 'docs/architecture.md',
      },
      {
        id: 'kb-002',
        title: `Result for "${input.query}" — Token refresh flow`,
        snippet: 'Refresh tokens are rotated on each use to prevent replay.',
        score: 0.82,
        source: 'docs/auth.md',
      },
      {
        id: 'kb-003',
        title: `Result for "${input.query}" — Session storage`,
        snippet: 'Sessions are stored in Redis with a 24-hour TTL.',
        score: 0.71,
        source: 'docs/infrastructure.md',
      },
    ];
  }

  stats(): KnowledgeStatsOutput {
    return {
      totalItems: 142,
      hotItems: 38,
      warmItems: 67,
      coldItems: 37,
      lastCompaction: '2026-09-01T10:30:00Z',
    };
  }

  compact(): KnowledgeCompactOutput {
    return {
      compacted: 12,
      removed: 5,
      duration: '1.3s',
    };
  }
}
