#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, ['warn', 'error']);
}

await bootstrap();
