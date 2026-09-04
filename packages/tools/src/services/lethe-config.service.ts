import { Injectable } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { LetheConfigSchema, type LetheConfig } from '../schemas/index.js';

@Injectable()
export class LetheConfigService {
  constructor(private readonly config: ConfigService) {}

  load(): LetheConfig {
    try {
      const { config } = this.config.load();
      if (config.lethe) {
        return LetheConfigSchema.parse(config.lethe);
      }
    } catch {
      // virgil.json not found or invalid
    }
    return LetheConfigSchema.parse({});
  }
}
