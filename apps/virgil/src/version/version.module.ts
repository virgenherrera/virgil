import { Module } from '@nestjs/common';
import { VersionCommand } from './version.command.js';

@Module({
  providers: [VersionCommand],
})
export class VersionModule {}
