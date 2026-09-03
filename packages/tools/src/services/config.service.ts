import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  HardwareProfile,
  VirgilLocalMinionsConfig,
} from '../schemas/index.js';
import { VirgilLocalMinionsConfigSchema } from '../schemas/index.js';

@Injectable()
export class ConfigService {
  getRepoRoot(): string {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
    }).trim();
  }

  getConfigPath(): string {
    return join(this.getRepoRoot(), 'virgil.json');
  }

  load(): {
    config: Record<string, unknown>;
    localMinions: VirgilLocalMinionsConfig;
  } {
    const configPath = this.getConfigPath();
    if (!existsSync(configPath)) {
      throw new Error('virgil.json not found at project root.');
    }
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    if (!config.localMinions) {
      config.localMinions = {
        ceiling: 'worker',
        allowedTiers: ['worker'],
        model: null,
        effectiveCeiling: null,
        hardwareProfileHash: null,
        lastProbeDate: null,
      };
    }
    const localMinions = VirgilLocalMinionsConfigSchema.parse(
      config.localMinions,
    );
    return { config, localMinions };
  }

  save(localMinions: VirgilLocalMinionsConfig): void {
    const configPath = this.getConfigPath();
    if (!existsSync(configPath)) {
      throw new Error('virgil.json not found at project root.');
    }
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    config.localMinions = localMinions;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  hashProfile(profile: HardwareProfile): string {
    const serialized = JSON.stringify({
      cpu: profile.cpu,
      gpu: profile.gpu,
      ram: { totalGb: profile.ram.totalGb },
    });
    return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
  }
}
