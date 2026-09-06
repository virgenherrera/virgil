import { Injectable } from '@nestjs/common';
import type { StateDirectoryContext } from './state-directory.util.js';
import {
  defaultStateDirectoryContext,
  ensureStateRoot,
  resolveStateRoot,
} from './state-directory.util.js';

/**
 * DI-hosted wrapper around the pure `state-directory.util.ts` functions.
 * `WorkspaceFsService` injects this to resolve/ensure the real state root;
 * tests inject it to exercise platform/env resolution branches through
 * the NestJS container instead of calling the bare utility functions in
 * isolation.
 */
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
