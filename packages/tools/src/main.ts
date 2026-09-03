#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import { ProbeModule } from './probe.module.js';

async function bootstrap(): Promise<void> {
  await CommandFactory.run(ProbeModule, ['warn', 'error']);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
