import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { ProviderCommand } from './provider.command.js';
import { ProviderAddCommand } from './provider-add.command.js';
import { ProviderListCommand } from './provider-list.command.js';
import { ProviderTestCommand } from './provider-test.command.js';
import { ProviderRemoveCommand } from './provider-remove.command.js';
import { ProviderService } from './provider.service.js';

@Module({
  imports: [SharedModule],
  providers: [
    ProviderService,
    ProviderCommand,
    ProviderAddCommand,
    ProviderListCommand,
    ProviderTestCommand,
    ProviderRemoveCommand,
  ],
})
export class ProviderModule {}
