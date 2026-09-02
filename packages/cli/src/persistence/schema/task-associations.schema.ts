import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

/**
 * TASK_ASSOCIATION — links an artifact to the external work item (issue,
 * ticket) that triggered its discovery, was produced by it, or references
 * it (D5). `taskId` is the external provider's own identifier; Virgil does
 * not own task identity.
 */
export const taskAssociations = sqliteTable(
  'task_associations',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunk: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
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
