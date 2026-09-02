import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  CreateTaskAssociationInputSchema,
  TaskAssociationSchema,
  isoToTimestamp,
  nowIso,
} from '../persistence.types.js';
import type {
  CreateTaskAssociationInput,
  TaskAssociation,
} from '../persistence.types.js';
import { createUlid } from '../../shared/primitives.js';
import { taskAssociations } from '../schema/index.js';

type TaskAssociationRow = typeof taskAssociations.$inferSelect;

function toDomain(row: TaskAssociationRow): TaskAssociation {
  return TaskAssociationSchema.parse({
    id: row.id,
    artifactId: row.artifactId,
    taskId: row.taskId,
    taskProviderType: row.taskProviderType,
    associationType: row.associationType,
    createdAt: isoToTimestamp(row.createdAt),
  });
}

/**
 * Data access for `TASK_ASSOCIATION` rows (D5): links between artifacts
 * and the external work items that triggered their discovery.
 */
@Injectable()
export class TaskAssociationRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  create(rawInput: CreateTaskAssociationInput): TaskAssociation {
    const input = CreateTaskAssociationInputSchema.parse(rawInput);
    const row = {
      id: createUlid(),
      artifactId: input.artifactId,
      taskId: input.taskId,
      taskProviderType: input.taskProviderType,
      associationType: input.associationType,
      createdAt: nowIso(),
    };

    this.connection.db.insert(taskAssociations).values(row).run();
    return toDomain(row);
  }

  /** "What knowledge was discovered for task X?" */
  findByTask(taskId: string): TaskAssociation[] {
    const rows = this.connection.db
      .select()
      .from(taskAssociations)
      .where(eq(taskAssociations.taskId, taskId))
      .all();
    return rows.map(toDomain);
  }

  /** "Which tasks reference artifact Y?" */
  findByArtifact(artifactId: string): TaskAssociation[] {
    const rows = this.connection.db
      .select()
      .from(taskAssociations)
      .where(eq(taskAssociations.artifactId, artifactId))
      .all();
    return rows.map(toDomain);
  }
}
