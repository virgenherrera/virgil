/** DI token for the {@link import('./database.provider.js').DatabaseConnection}. */
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

/** DI token for {@link import('./persistence.module.js').PersistenceModuleOptions}. */
export const PERSISTENCE_OPTIONS = Symbol('PERSISTENCE_OPTIONS');

/** Default on-disk location for the knowledge database, relative to `process.cwd()`. */
export const DEFAULT_DATABASE_PATH = '.virgil/knowledge.db';
