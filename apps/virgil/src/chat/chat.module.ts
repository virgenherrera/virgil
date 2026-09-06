import { Module } from '@nestjs/common';
import { ChatProviderFactory } from './chat-provider.factory.js';
import { TargetedDiscoveryService } from './targeted-discovery.service.js';

@Module({
  providers: [ChatProviderFactory, TargetedDiscoveryService],
  exports: [ChatProviderFactory, TargetedDiscoveryService],
})
export class ChatModule {}
