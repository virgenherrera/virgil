import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

export const lifecycleTransitions = sqliteTable(
  'lifecycle_transitions',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        { onDelete: 'cascade' },
      ),
    previousState: text('previous_state').notNull(),
    newState: text('new_state').notNull(),
    timestamp: integer('timestamp').notNull(),
    metricSnapshot: text('metric_snapshot'),
  },
  (table) => [
    index('lifecycle_transitions_artifact_idx').on(table.artifactId),
    index('lifecycle_transitions_timestamp_idx').on(table.timestamp),
  ],
);
