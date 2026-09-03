import { Injectable } from '@nestjs/common';
import { createInterface } from 'node:readline';

@Injectable()
export class PromptService {
  async ask(question: string): Promise<string> {
    if (!process.stdin.isTTY) {
      throw new Error(
        'Interactive input required but stdin is not a TTY. Use --max-minions and --tiers flags instead.',
      );
    }
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
