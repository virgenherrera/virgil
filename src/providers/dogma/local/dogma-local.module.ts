import { type DynamicModule, Module } from "@nestjs/common";
import {
  DogmaLocalConfig,
  DOGMA_LOCAL_CONFIG_TOKEN,
} from "./dogma-local.config.js";
import { DogmaLocalService } from "./dogma-local.service.js";

@Module({})
export class DogmaLocalModule {
  static registerIfConfigured(): DynamicModule {
    const result = DogmaLocalConfig.schema.safeParse(process.env);

    if (
      !result.success ||
      !(result.data as { configured: boolean }).configured
    ) {
      return { module: DogmaLocalModule };
    }

    return {
      module: DogmaLocalModule,
      providers: [
        {
          provide: DOGMA_LOCAL_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        DogmaLocalService,
      ],
      exports: [DogmaLocalService],
    };
  }
}
