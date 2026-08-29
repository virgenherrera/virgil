import { type DynamicModule, Module } from "@nestjs/common";
import {
  OrgLocalConfig,
  ORG_LOCAL_CONFIG_TOKEN,
} from "./org-local.config.js";
import { OrgLocalService } from "./org-local.service.js";

@Module({})
export class OrgLocalModule {
  static registerIfConfigured(): DynamicModule {
    const result = OrgLocalConfig.schema.safeParse(process.env);

    if (
      !result.success ||
      !(result.data as { configured: boolean }).configured
    ) {
      return { module: OrgLocalModule };
    }

    return {
      module: OrgLocalModule,
      providers: [
        {
          provide: ORG_LOCAL_CONFIG_TOKEN,
          useValue: Object.freeze(result.data),
        },
        OrgLocalService,
      ],
      exports: [OrgLocalService],
    };
  }
}
