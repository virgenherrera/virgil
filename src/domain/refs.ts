import { ERROR_CODE, AppError } from "../shared/errors.js";

const PROVIDER_KIND = {
  DOGMA: "dogma",
  ORG: "org",
  TICKET: "ticket",
  CHAT: "chat",
  SOURCECODE: "sourcecode",
} as const;

export type ProviderKind = (typeof PROVIDER_KIND)[keyof typeof PROVIDER_KIND];

export const PROVIDER_KINDS: readonly ProviderKind[] = Object.values(PROVIDER_KIND);

/** Branded string representing a semantic reference URI */
export type SemanticRef = string & { readonly __brand: unique symbol };

export interface ParsedRef {
  readonly kind: ProviderKind;
  readonly backend: string;
  readonly id: string;
}

const REF_PATTERN = /^([a-z]+):\/\/([a-zA-Z0-9._-]+)\/(.+)$/;

export function parseRef(uri: string): ParsedRef {
  const match = REF_PATTERN.exec(uri);
  if (!match) {
    throw new AppError(
      `Invalid semantic ref: "${uri}". Expected format: {kind}://{backend}/{id}`,
      ERROR_CODE.REF_PARSE_FAILED,
    );
  }

  const [, kind, backend, id] = match;

  if (!PROVIDER_KINDS.includes(kind as ProviderKind)) {
    throw new AppError(
      `Unknown provider kind: "${kind}". Valid kinds: ${PROVIDER_KINDS.join(", ")}`,
      ERROR_CODE.REF_PARSE_FAILED,
    );
  }

  return {
    kind: kind as ProviderKind,
    backend: backend!,
    id: id!,
  };
}

export function buildRef(kind: ProviderKind, backend: string, id: string): SemanticRef {
  return `${kind}://${backend}/${id}` as SemanticRef;
}
