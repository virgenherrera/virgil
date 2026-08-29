import { DynamicModule, Module } from "@nestjs/common";
import type { z } from "zod";
import { ConfigurationError } from "../shared/errors.js";

export interface ConfigClass {
  readonly schema: z.ZodType;
  readonly namespace: string;
}

@Module({})
export class AppConfigModule {
  static forRoot(configClasses: readonly ConfigClass[]): DynamicModule {
    const providers = configClasses.map((configClass) => {
      const result = configClass.schema.safeParse(process.env);

      if (!result.success) {
        throw new ConfigurationError(
          `Configuration validation failed for namespace "${configClass.namespace}": ${
            JSON.stringify(result.error.issues, null, 2)
          }`,
          result.error,
        );
      }

      return {
        provide: `CONFIG_${configClass.namespace.toUpperCase()}`,
        useValue: Object.freeze(result.data),
      };
    });

    return {
      module: AppConfigModule,
      global: true,
      providers,
      exports: providers.map((p) => p.provide),
    };
  }
}
