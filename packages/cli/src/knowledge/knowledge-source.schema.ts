import { z } from 'zod';

/** Confluence API source configuration. */
export const ConfluenceApiSourceSchema = z.object({
  type: z.literal('confluence-api'),
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1, { error: 'API token must not be empty' }),
  spaceKey: z.string().min(1, { error: 'Space key must not be empty' }),
  perPage: z.number().int().positive().max(100).default(25),
});

export type ConfluenceApiSourceConfig = z.infer<
  typeof ConfluenceApiSourceSchema
>;

/** Confluence CDP source configuration. */
export const ConfluenceCdpSourceSchema = z.object({
  type: z.literal('confluence-cdp'),
  baseUrl: z.string().url(),
  browser: z
    .enum(['chrome', 'firefox', 'edge', 'safari'])
    .default('chrome'),
  headless: z.boolean().default(true),
  profilePath: z.string().optional(),
});

export type ConfluenceCdpSourceConfig = z.infer<
  typeof ConfluenceCdpSourceSchema
>;

/** Local filesystem source configuration. */
export const LocalFilesystemSourceSchema = z.object({
  type: z.literal('local-filesystem'),
  rootPath: z.string().min(1, { error: 'Root path must not be empty' }),
  include: z
    .array(z.string().min(1))
    .default(['**/*.md', '**/*.txt', '**/*.html', '**/*.pdf']),
  exclude: z.array(z.string().min(1)).default(['**/node_modules/**', '**/.git/**']),
});

export type LocalFilesystemSourceConfig = z.infer<
  typeof LocalFilesystemSourceSchema
>;

/** Discriminated union of all knowledge source configurations. */
export const KnowledgeSourceConfigSchema = z.discriminatedUnion('type', [
  ConfluenceApiSourceSchema,
  ConfluenceCdpSourceSchema,
  LocalFilesystemSourceSchema,
]);

export type KnowledgeSourceConfig = z.infer<typeof KnowledgeSourceConfigSchema>;
