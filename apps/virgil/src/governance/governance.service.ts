import { Injectable } from '@nestjs/common';
import type { BudgetOutput, AuditOutput } from './governance.schemas.js';

@Injectable()
export class GovernanceService {
  budget(_period?: string): BudgetOutput {
    return {
      total: 1000000,
      used: 350000,
      remaining: 650000,
      period: _period ?? 'monthly',
    };
  }

  audit(_since?: string): AuditOutput {
    return [
      {
        timestamp: '2026-09-04T10:00:00Z',
        action: 'generate',
        agent: 'copilot',
        tokens: 1500,
      },
      {
        timestamp: '2026-09-04T09:30:00Z',
        action: 'review',
        agent: 'reviewer',
        tokens: 800,
      },
    ];
  }
}
