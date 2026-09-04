import { Module } from '@nestjs/common';

import {
  BenchmarkCommand,
  CeilingCommand,
  DelegateCommand,
  DetectCommand,
  FitnessCommand,
  LetheCommand,
  ProbeCommand,
  SelectCommand,
} from './commands/index.js';
import {
  CeilingCalculatorService,
  ConfigService,
  CrawlDirsService,
  DmrClientService,
  FitnessScoringService,
  HardwareDetectionService,
  LetheConfigService,
  PromptService,
  ReadFileService,
  ReadJsonService,
} from './services/index.js';

@Module({
  providers: [
    HardwareDetectionService,
    FitnessScoringService,
    CeilingCalculatorService,
    DmrClientService,
    ConfigService,
    PromptService,
    LetheConfigService,
    ReadFileService,
    ReadJsonService,
    CrawlDirsService,
    DetectCommand,
    FitnessCommand,
    CeilingCommand,
    ProbeCommand,
    BenchmarkCommand,
    SelectCommand,
    DelegateCommand,
    LetheCommand,
  ],
})
export class ProbeModule {}
