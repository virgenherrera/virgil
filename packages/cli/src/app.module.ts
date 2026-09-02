import { Module } from '@nestjs/common';
import { VersionCommand } from './commands/version.command.js';

@Module({
  providers: [VersionCommand],
})
export class AppModule {}
