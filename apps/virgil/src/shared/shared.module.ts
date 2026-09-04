import { Module } from '@nestjs/common';
import { PromptService } from './prompt.service.js';

@Module({
  providers: [PromptService],
  exports: [PromptService],
})
export class SharedModule {}
