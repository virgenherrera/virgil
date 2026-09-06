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

      const naturalNext = startOffset + this.stepChars;
      const overlapAdjusted = endOffset - this.overlapChars;
      startOffset = Math.max(naturalNext, overlapAdjusted);

      if (startOffset >= content.length) {
        break;
      }
    }

    return results;
  }

  private snapToSentenceBoundary(
    content: string,
    start: number,
    end: number,
  ): number {
    const searchWindow = Math.min(Math.floor(this.maxChars * 0.1), end - start);
    const searchStart = Math.max(end - searchWindow, start);
    const searchRegion = content.slice(searchStart, end);

    const sentenceEnders = /[.!?]\s/g;
    let lastMatch = -1;
    let match: RegExpExecArray | null;

    while ((match = sentenceEnders.exec(searchRegion)) !== null) {
      lastMatch = match.index + 1;
    }

    if (lastMatch !== -1) {
      return searchStart + lastMatch;
    }

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
