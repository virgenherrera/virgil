import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

/**
 * RELATIONSHIP — a typed, directed edge between two artifacts (D4).
 *
 * `relationshipType` is stored as unconstrained `text` rather than a SQL
 * `CHECK`/enum column so new relationship types never require a schema
 * migration; the closed set of well-known types
 * (`RELATIONSHIP_TYPES` in `persistence.types.ts`) is enforced at the
 * application layer by Zod instead.
 */
export const relationships = sqliteTable(
  'relationships',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunks below: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
    sourceArtifactId: text('source_artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        {
          onDelete: 'cascade',
        },
      ),
    targetArtifactId: text('target_artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        {
          onDelete: 'cascade',
        },
      ),
    relationshipType: text('relationship_type').notNull(),
    /** JSON — optional context; validated by Zod on read. */
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('relationships_unique_edge').on(
      table.sourceArtifactId,
      table.targetArtifactId,
      table.relationshipType,
    ),
    index('relationships_source_idx').on(table.sourceArtifactId),
    index('relationships_target_idx').on(table.targetArtifactId),
    index('relationships_type_idx').on(table.relationshipType),
  ],
);
