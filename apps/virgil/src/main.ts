#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';
import { NonTtyError } from './shared/non-tty.error.js';
import { ZodError } from 'zod';

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    logger: ['error', 'warn'],
  });
}

bootstrap().catch((error: unknown) => {
  if (error instanceof NonTtyError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof ZodError) {
    const issues = error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    process.stderr.write(`Validation error:\n${issues}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
