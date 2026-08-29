import type { SemanticRef } from "../../domain/refs.js";

export interface DogmaDocument {
  readonly ref: SemanticRef;
  readonly relativePath: string;
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: string;
}
