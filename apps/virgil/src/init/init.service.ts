import { Injectable } from '@nestjs/common';
import type { InitInput, InitOutput } from './init.schemas.js';

@Injectable()
export class InitService {
  init(input: InitInput): InitOutput {
    return {
      workspace: input.slug ?? 'my-workspace',
      path: input.path,
      name: input.name ?? 'My Workspace',
      created: true,
    };
  }
}
