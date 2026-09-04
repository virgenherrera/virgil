import { Injectable } from '@nestjs/common';
import type {
  ProviderAddInput,
  ProviderAddOutput,
  ProviderListOutput,
} from './provider.schemas.js';

@Injectable()
export class ProviderService {
  add(input: ProviderAddInput): ProviderAddOutput {
    return {
      id: 'prov-001',
      type: input.type,
      status: 'active',
    };
  }

  list(): ProviderListOutput {
    return [
      { id: 'prov-001', type: 'repo', name: 'GitHub', status: 'active' },
      {
        id: 'prov-002',
        type: 'knowledge',
        name: 'Confluence',
        status: 'active',
      },
    ];
  }
}
