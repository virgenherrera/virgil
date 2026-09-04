import { Injectable } from '@nestjs/common';
import type {
  RepoAddInput,
  RepoAddOutput,
  RepoListOutput,
  RepoShowOutput,
} from './repo.schemas.js';

@Injectable()
export class RepoService {
  add(input: RepoAddInput): RepoAddOutput {
    return {
      slug: 'my-workspace',
      path: input.path,
      alias: input.alias,
      registered: true,
    };
  }

  list(): RepoListOutput {
    return [
      { alias: 'frontend', path: '/home/user/projects/frontend' },
      { alias: 'backend', path: '/home/user/projects/backend' },
    ];
  }

  show(alias: string): RepoShowOutput {
    return {
      alias,
      path: `/home/user/projects/${alias}`,
      branch: 'main',
      remoteUrl: `https://github.com/org/${alias}.git`,
    };
  }
}
