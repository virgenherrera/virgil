import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const DogmaLocalConfigSchema = z
  .object({
    VIRGIL_DOGMA_LOCAL_PATH: z.string().optional(),
  })
  .transform((data) => ({
    path: data.VIRGIL_DOGMA_LOCAL_PATH ?? "",
    configured:
      data.VIRGIL_DOGMA_LOCAL_PATH !== undefined &&
      data.VIRGIL_DOGMA_LOCAL_PATH !== "",
  }));

export type DogmaLocalConfigType = z.infer<typeof DogmaLocalConfigSchema>;

export const DOGMA_LOCAL_CONFIG_TOKEN = "CONFIG_DOGMA_LOCAL";

export const DogmaLocalConfig: ConfigClass = {
  namespace: "dogma_local",
  schema: DogmaLocalConfigSchema,
};
