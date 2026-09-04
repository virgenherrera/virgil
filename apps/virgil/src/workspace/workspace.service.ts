import { Injectable } from '@nestjs/common';
import type { WorkspaceCreateInput, WorkspaceCreateOutput } from './workspace.schemas.js';
import type { WorkspaceListOutput } from './workspace.schemas.js';
import type { WorkspaceSelectInput, WorkspaceSelectOutput } from './workspace.schemas.js';
import type { WorkspaceShowInput, WorkspaceShowOutput } from './workspace.schemas.js';
import type { WorkspaceDeleteInput, WorkspaceDeleteOutput } from './workspace.schemas.js';

@Injectable()
export class WorkspaceService {
  create(input: WorkspaceCreateInput): WorkspaceCreateOutput {
    return {
      slug: input.slug,
      name: input.name ?? input.slug,
      created: true,
    };
  }

  list(): WorkspaceListOutput {
    return {
      workspaces: [
        { slug: 'my-workspace', name: 'My Workspace', active: true },
        { slug: 'other-project', name: 'Other Project', active: false },
      ],
    };
  }

  select(input: WorkspaceSelectInput): WorkspaceSelectOutput {
    return {
      slug: input.slug,
      selected: true,
    };
  }

  show(input: WorkspaceShowInput): WorkspaceShowOutput {
    return {
      slug: input.slug,
      name: input.slug,
      path: `/home/user/.virgil/workspaces/${input.slug}`,
      active: true,
    };
  }

  delete(input: WorkspaceDeleteInput): WorkspaceDeleteOutput {
    return {
      slug: input.slug,
      deleted: input.confirm,
    };
  }
}
