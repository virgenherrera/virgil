import {
  PomValidationError,
  PomVersionMismatchError,
} from '../errors/cdp-errors.js';
import {
  type PomDefinition,
  PomDefinitionSchema,
  parsePomVersionMajor,
} from './pom-schema.js';

function registryKey(targetApp: string, version: string): string {
  return `${targetApp}::${version}`;
}

/**
 * Resolves and stores versioned POM definitions, keyed by `(targetApp, version)`.
 *
 * Registration validates the definition against {@link PomDefinitionSchema};
 * invalid definitions are rejected with a {@link PomValidationError} and
 * never reach the executor.
 */
export class PomRegistry {
  private readonly definitions = new Map<string, PomDefinition>();

  /**
   * Validates and stores a POM definition.
   *
   * @throws {PomValidationError} when the definition fails schema validation.
   */
  register(candidate: unknown): PomDefinition {
    const result = PomDefinitionSchema.safeParse(candidate);

    if (!result.success) {
      throw new PomValidationError('POM definition failed schema validation.', {
        issues: result.error.issues,
      });
    }

    const pom = result.data;
    this.definitions.set(registryKey(pom.targetApp, pom.version), pom);

    return pom;
  }

  /**
   * Resolves a POM definition by target application and optional version.
   * When `version` is omitted, or is `"latest"`, the highest-major-version
   * definition registered for `targetApp` is returned.
   *
   * @throws {PomVersionMismatchError} when no matching definition exists.
   */
  resolve(targetApp: string, version?: string): PomDefinition {
    if (version && version !== 'latest') {
      const exact = this.definitions.get(registryKey(targetApp, version));

      if (!exact) {
        throw new PomVersionMismatchError(
          `No POM registered for target "${targetApp}" at version "${version}".`,
          { targetApp, version },
        );
      }

      return exact;
    }

    const candidates = this.list(targetApp);

    if (candidates.length === 0) {
      throw new PomVersionMismatchError(
        `No POM registered for target "${targetApp}".`,
        {
          targetApp,
        },
      );
    }

    return candidates.reduce((latest, current) =>
      parsePomVersionMajor(current.version) >
      parsePomVersionMajor(latest.version)
        ? current
        : latest,
    );
  }

  /** Lists every registered POM, optionally filtered by target application. */
  list(targetApp?: string): PomDefinition[] {
    const all = [...this.definitions.values()];

    return targetApp ? all.filter((pom) => pom.targetApp === targetApp) : all;
  }
}
