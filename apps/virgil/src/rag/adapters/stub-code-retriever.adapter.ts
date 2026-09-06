import { Injectable } from '@nestjs/common';
import type {
  CodeRetriever,
  CodeRetrieverResponse,
  CodeRetrievalQuery,
} from '../ports/code-retriever.port.js';

@Injectable()
export class StubCodeRetriever implements CodeRetriever {
  async retrieveCode(
    _query: CodeRetrievalQuery,
  ): Promise<CodeRetrieverResponse> {
    return {
      results: [],
      notice: {
        available: false as const,
        reason:
          'CodeGraph service (H05) is not available. Code retrieval returns empty results.',
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
