import {
  ConfigurationError,
  ProviderError,
  AppError,
  ERROR_CODE,
} from "./errors.js";

function formatConfigError(error: ConfigurationError): string {
  return [
    `Error [${error.code}]: ${error.message}`,
    'Hint: Run `virgil init` to generate a config template.',
    "Hint: Set the required environment variables or add them to .virgilrc.yaml",
  ].join("\n");
}

function formatProviderError(error: ProviderError): string {
  const base = `Error [${error.code}]: ${error.message}`;

  if (error.code === ERROR_CODE.PROVIDER_UNAVAILABLE) {
    return `${base}\nHint: Check your credentials and network connection`;
  }

  if (error.code === ERROR_CODE.PROVIDER_TIMEOUT) {
    return `${base}\nHint: The provider took too long to respond. Try again or check the service status`;
  }

  return base;
}

export function formatError(error: unknown): string {
  if (error instanceof ConfigurationError) {
    return formatConfigError(error);
  }
  if (error instanceof ProviderError) {
    return formatProviderError(error);
  }
  if (error instanceof AppError) {
    return `Error [${error.code}]: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
