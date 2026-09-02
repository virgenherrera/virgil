/**
 * Typed error taxonomy for the `@virgil/pw-cdp` browser automation domain.
 *
 * Every error carries a stable machine-readable `code` plus structured
 * `metadata` so consumers can branch on failure kind without parsing
 * message strings.
 */

/**
 * Base class for every error raised by this package.
 */
export abstract class CdpError extends Error {
  /** Stable machine-readable error code. */
  readonly code: string;

  /** Structured contextual data describing the failure. */
  readonly metadata: Readonly<Record<string, unknown>>;

  protected constructor(
    message: string,
    code: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.metadata = Object.freeze({ ...metadata });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when a browser process fails to launch or attach a persistent context. */
export class BrowserLaunchError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'BROWSER_LAUNCH_ERROR', metadata);
  }
}

/** Raised when a browser session is no longer usable (profile lock lost, context closed). */
export class SessionExpiredError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'SESSION_EXPIRED_ERROR', metadata);
  }
}

/** Raised when a POM definition fails Zod schema validation. */
export class PomValidationError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'POM_VALIDATION_ERROR', metadata);
  }
}

/** Raised when a requested POM version is incompatible with, or missing for, the target app. */
export class PomVersionMismatchError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'POM_VERSION_MISMATCH_ERROR', metadata);
  }
}

/** Raised when a required DOM selector cannot be located on the page. */
export class SelectorNotFoundError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'SELECTOR_NOT_FOUND_ERROR', metadata);
  }
}

/** Raised when navigation does not settle within the configured timeout. */
export class NavigationTimeoutError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'NAVIGATION_TIMEOUT_ERROR', metadata);
  }
}

/** Raised when extraction produces no usable data, or fails output-shape validation. */
export class ExtractionError extends CdpError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'EXTRACTION_ERROR', metadata);
  }
}
