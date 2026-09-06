import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

export const taskAssociations = sqliteTable(
  'task_associations',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        {
          onDelete: 'cascade',
        },
      ),
    taskId: text('task_id').notNull(),
    taskProviderType: text('task_provider_type').notNull(),
    associationType: text('association_type').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('task_associations_unique').on(
      table.artifactId,
      table.taskId,
      table.associationType,
    ),
    index('task_associations_artifact_idx').on(table.artifactId),
    index('task_associations_task_idx').on(table.taskId),
  ],
);
