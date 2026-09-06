import { Module } from '@nestjs/common';
import { HandoffProtocolFactory } from './handoff-protocol.service.js';

@Module({
  providers: [HandoffProtocolFactory],
  exports: [HandoffProtocolFactory],
})
export class HandoffProtocolModule {}
