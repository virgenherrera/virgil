import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

export const relationships = sqliteTable(
  'relationships',
  {
    id: text('id').primaryKey(),
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
