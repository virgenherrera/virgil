import { Injectable } from '@nestjs/common';
import { createContentHash, createUlid } from '../../shared/primitives.js';
import type {
  Chunker,
  ChunkMetadataInput,
  ChunkOutput,
} from '../ports/chunker.port.js';
import {
  APPROXIMATE_CHARS_PER_TOKEN,
  DEFAULT_CHUNK_OVERLAP_RATIO,
  DEFAULT_CHUNK_TOKEN_SIZE,
} from '../rag.constants.js';

/**
 * Fixed-window chunker for document/prose content (D1). Splits content
 * into overlapping windows of configurable token size, snapping to
 * sentence boundaries when possible.
 *
 * Token counting uses an approximate chars-per-token heuristic. A proper
 * tokenizer can be wired in via the {@link Chunker} port if higher
 * accuracy is needed.
 */
@Injectable()
export class FixedWindowChunker implements Chunker {
  private readonly maxChars: number;
  private readonly overlapChars: number;
  private readonly stepChars: number;

  constructor(
    tokenSize: number = DEFAULT_CHUNK_TOKEN_SIZE,
    overlapRatio: number = DEFAULT_CHUNK_OVERLAP_RATIO,
  ) {
    this.maxChars = tokenSize * APPROXIMATE_CHARS_PER_TOKEN;
    this.overlapChars = Math.floor(this.maxChars * overlapRatio);
    this.stepChars = this.maxChars - this.overlapChars;
  }

  chunk(content: string, metadata: ChunkMetadataInput): ChunkOutput[] {
    if (!content || content.trim().length === 0) {
      return [];
    }

    const results: ChunkOutput[] = [];
    let position = 0;
    let startOffset = 0;

    while (startOffset < content.length) {
      let endOffset = Math.min(startOffset + this.maxChars, content.length);

      // Snap to sentence boundary when not at the end of content
      if (endOffset < content.length) {
        endOffset = this.snapToSentenceBoundary(
          content,
          startOffset,
          endOffset,
        );
      }

      const chunkContent = content.slice(startOffset, endOffset);
      const tokenCount = this.estimateTokenCount(chunkContent);

      results.push({
        id: createUlid(),
        content: chunkContent,
        contentHash: createContentHash(chunkContent),
        sourceId: metadata.sourceId,
        position,
        startOffset,
        endOffset,
        tokenCount,
      });

      position++;

      // Advance by step size, adjusted if sentence snapping moved the boundary
      const naturalNext = startOffset + this.stepChars;
      const overlapAdjusted = endOffset - this.overlapChars;
      startOffset = Math.max(naturalNext, overlapAdjusted);

      if (startOffset >= content.length) {
        break;
      }
    }

    return results;
  }

  /**
   * Looks for a sentence-ending punctuation mark near the proposed end
   * offset. Searches backwards within a window equal to 10% of the max
   * chunk size. If no boundary is found, falls back to the original offset.
   */
  private snapToSentenceBoundary(
    content: string,
    start: number,
    end: number,
  ): number {
    const searchWindow = Math.min(Math.floor(this.maxChars * 0.1), end - start);
    const searchStart = Math.max(end - searchWindow, start);
    const searchRegion = content.slice(searchStart, end);

    // Find the last sentence-ending punctuation followed by whitespace
    const sentenceEnders = /[.!?]\s/g;
    let lastMatch = -1;
    let match: RegExpExecArray | null;

    while ((match = sentenceEnders.exec(searchRegion)) !== null) {
      // Include the punctuation character, exclude the whitespace
      lastMatch = match.index + 1;
    }

    if (lastMatch !== -1) {
      return searchStart + lastMatch;
    }

    // Check if the character at the boundary is itself a sentence ender
    const charBefore = content[end - 1];
    if (charBefore === '.' || charBefore === '!' || charBefore === '?') {
      return end;
    }

    return end;
  }

  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / APPROXIMATE_CHARS_PER_TOKEN);
  }
}
