import { Injectable } from '@nestjs/common';
import type { StateDirectoryContext } from './state-directory.util.js';
import {
  defaultStateDirectoryContext,
  ensureStateRoot,
  resolveStateRoot,
} from './state-directory.util.js';

@Injectable()
export class StateDirectoryService {
  resolveRoot(overrides: Partial<StateDirectoryContext> = {}): string {
    return resolveStateRoot({
      ...defaultStateDirectoryContext(),
      ...overrides,
    });
  }

  async ensureRoot(
    overrides: Partial<StateDirectoryContext> = {},
  ): Promise<string> {
    return ensureStateRoot({ ...defaultStateDirectoryContext(), ...overrides });
  }
}
