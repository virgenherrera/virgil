import { Injectable } from '@nestjs/common';
import {
  InputData,
  jsonInputForTargetLanguage,
  quicktype,
} from 'quicktype-core';

@Injectable()
export class ReadJsonService {
  async infer(jsonContent: string): Promise<string> {
    try {
      const jsonInput = jsonInputForTargetLanguage('typescript');
      await jsonInput.addSource({ name: 'Root', samples: [jsonContent] });
      const inputData = new InputData();
      inputData.addInput(jsonInput);
      const result = await quicktype({
        inputData,
        lang: 'typescript',
        rendererOptions: { 'just-types': 'true' },
      });
      return result.lines.join('\n');
    } catch {
      return this.fallback(jsonContent);
    }
  }

  private fallback(jsonContent: string): string {
    try {
      const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        const entries = Object.entries(parsed).map(
          ([key, value]) =>
            `${key}: ${Array.isArray(value) ? 'array' : typeof value}`,
        );
        return `{ ${entries.join(', ')} }`;
      }
      return typeof parsed;
    } catch {
      return jsonContent;
    }
  }
}
