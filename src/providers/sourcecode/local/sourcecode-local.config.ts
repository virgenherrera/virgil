import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const SourceCodeLocalConfigSchema = z
  .object({
    VIRGIL_SOURCECODE_PATHS: z.string().optional(),
  })
  .transform((data) => ({
    paths: data.VIRGIL_SOURCECODE_PATHS
      ? data.VIRGIL_SOURCECODE_PATHS.split(",").map((p) => p.trim()).filter(Boolean)
      : [],
    configured:
      data.VIRGIL_SOURCECODE_PATHS !== undefined &&
      data.VIRGIL_SOURCECODE_PATHS !== "",
  }));

export type SourceCodeLocalConfigType = z.infer<typeof SourceCodeLocalConfigSchema>;

export const SOURCECODE_LOCAL_CONFIG_TOKEN = "CONFIG_SOURCECODE_LOCAL";

export const SourceCodeLocalConfig: ConfigClass = {
  namespace: "sourcecode_local",
  schema: SourceCodeLocalConfigSchema,
};
