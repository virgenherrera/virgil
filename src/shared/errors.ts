export const ERROR_CODE = {
  CONFIGURATION_INVALID: "CONFIGURATION_INVALID",
  CONFIGURATION_MISSING: "CONFIGURATION_MISSING",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_SCHEMA_MISMATCH: "PROVIDER_SCHEMA_MISMATCH",
  REF_PARSE_FAILED: "REF_PARSE_FAILED",
  REF_UNRESOLVABLE: "REF_UNRESOLVABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, ERROR_CODE.CONFIGURATION_INVALID, cause);
    this.name = "ConfigurationError";
  }
}

export class ProviderError extends AppError {
  constructor(
    message: string,
    code:
      | typeof ERROR_CODE.PROVIDER_UNAVAILABLE
      | typeof ERROR_CODE.PROVIDER_TIMEOUT
      | typeof ERROR_CODE.PROVIDER_SCHEMA_MISMATCH = ERROR_CODE.PROVIDER_UNAVAILABLE,
    cause?: unknown,
  ) {
    super(message, code, cause);
    this.name = "ProviderError";
  }
}
