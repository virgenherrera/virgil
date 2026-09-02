import { Module } from '@nestjs/common';
import { HandoffProtocolFactory } from './handoff-protocol.service.js';

/**
 * Hosts {@link HandoffProtocolFactory} as a NestJS module (H09 D7).
 * Discovery/Orchestrator (H08) and agent orchestration (H10) modules import
 * this module and inject `HandoffProtocolFactory` to produce and transition
 * handoff envelopes; this module has no dependency on any provider,
 * persistence, or orchestration layer (see H09 Risks and Constraints:
 * "Handoff schema may become a coupling point").
 */
@Module({
  providers: [HandoffProtocolFactory],
  exports: [HandoffProtocolFactory],
})
export class HandoffProtocolModule {}
