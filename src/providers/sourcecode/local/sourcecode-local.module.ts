import { type DynamicModule, Module } from "@nestjs/common";
import {
  SourceCodeLocalConfig,
  SOURCECODE_LOCAL_CONFIG_TOKEN,
} from "./sourcecode-local.config.js";
import { SourceCodeLocalService } from "./sourcecode-local.service.js";

@Module({})
export class SourceCodeLocalModule {
  static registerIfConfigured(): DynamicModule {
    const result = SourceCodeLocalConfig.schema.safeParse(process.env);

    if (
      !result.success ||
      !(result.data as { configured: boolean }).configured
    ) {
      return { module: SourceCodeLocalModule };
    }

    return {
      module: SourceCodeLocalModule,
      providers: [
        {
          provide: SOURCECODE_LOCAL_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        SourceCodeLocalService,
      ],
      exports: [SourceCodeLocalService],
    };
  }
}
