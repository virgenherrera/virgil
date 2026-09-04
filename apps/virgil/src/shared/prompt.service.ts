import { Injectable } from '@nestjs/common';
import { input, select, confirm, checkbox, password } from '@inquirer/prompts';
import { NonTtyError } from './non-tty.error.js';

@Injectable()
export class PromptService {
  async input(message: string, opts?: { default?: string }): Promise<string> {
    if (!process.stdin.isTTY) throw new NonTtyError(message);
    return input({ message, default: opts?.default });
  }

  async select<T>(
    message: string,
    choices: { name: string; value: T }[],
  ): Promise<T> {
    if (!process.stdin.isTTY) throw new NonTtyError(message);
    return select({ message, choices });
  }

  async confirm(
    message: string,
    opts?: { default?: boolean },
  ): Promise<boolean> {
    if (!process.stdin.isTTY) throw new NonTtyError(message);
    return confirm({ message, default: opts?.default });
  }

  async checkbox<T>(
    message: string,
    choices: { name: string; value: T }[],
  ): Promise<T[]> {
    if (!process.stdin.isTTY) throw new NonTtyError(message);
    return checkbox({ message, choices });
  }

  async password(message: string): Promise<string> {
    if (!process.stdin.isTTY) throw new NonTtyError(message);
    return password({ message });
  }
}
