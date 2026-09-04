import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { InitCommand } from './init.command.js';
import { InitService } from './init.service.js';

@Module({
  imports: [SharedModule],
  providers: [InitService, InitCommand],
})
export class InitModule {}
