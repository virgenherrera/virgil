import { Module } from '@nestjs/common';

import {
  BenchmarkCommand,
  CeilingCommand,
  DetectCommand,
  FitnessCommand,
  ProbeCommand,
  SelectCommand,
} from './commands/index.js';
import {
  CeilingCalculatorService,
  ConfigService,
  DmrClientService,
  FitnessScoringService,
  HardwareDetectionService,
  PromptService,
} from './services/index.js';

@Module({
  providers: [
    HardwareDetectionService,
    FitnessScoringService,
    CeilingCalculatorService,
    DmrClientService,
    ConfigService,
    PromptService,
    DetectCommand,
    FitnessCommand,
    CeilingCommand,
    ProbeCommand,
    BenchmarkCommand,
    SelectCommand,
  ],
})
export class ProbeModule {}
