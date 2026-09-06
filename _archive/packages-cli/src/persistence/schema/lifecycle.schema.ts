import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

/**
 * LIFECYCLE_TRANSITION — an immutable audit-trail row recording every
 * lifecycle state change for an artifact (H15). Each transition captures
 * the previous and new state, a timestamp, and an optional metrics
 * snapshot at the time of transition.
 */
export const lifecycleTransitions = sqliteTable(
  'lifecycle_transitions',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunk: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
    artifactId: text('artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        { onDelete: 'cascade' },
      ),
    previousState: text('previous_state').notNull(),
    newState: text('new_state').notNull(),
    timestamp: integer('timestamp').notNull(),
    /** JSON — metrics snapshot at the time of transition; validated at the application layer. */
    metricSnapshot: text('metric_snapshot'),
  },
  (table) => [
    index('lifecycle_transitions_artifact_idx').on(table.artifactId),
    index('lifecycle_transitions_timestamp_idx').on(table.timestamp),
  ],
);
