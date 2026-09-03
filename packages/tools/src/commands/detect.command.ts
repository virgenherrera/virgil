import { Command, CommandRunner } from 'nest-commander';
import { HardwareDetectionService } from '../services/index.js';

@Command({ name: 'detect', description: 'Detect hardware capabilities' })
export class DetectCommand extends CommandRunner {
  constructor(private readonly hardware: HardwareDetectionService) {
    super();
  }

  async run(): Promise<void> {
    const profile = this.hardware.detect();
    console.log(JSON.stringify(profile, null, 2));
  }
}
