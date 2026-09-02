import { Injectable } from '@nestjs/common';
import type {
  CodeRetriever,
  CodeRetrieverResponse,
  CodeRetrievalQuery,
} from '../ports/code-retriever.port.js';

/**
 * Stub code retriever (D10) that returns empty results with a
 * degradation notice. Stands in for the real CodeGraph-backed adapter
 * until H05's `CodeGraphService` is available.
 */
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
