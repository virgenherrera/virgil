import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const OrgLocalConfigSchema = z
  .object({
    VIRGIL_ORG_LOCAL_PATH: z.string().optional(),
  })
  .transform((data) => ({
    path: data.VIRGIL_ORG_LOCAL_PATH ?? "",
    configured:
      data.VIRGIL_ORG_LOCAL_PATH !== undefined &&
      data.VIRGIL_ORG_LOCAL_PATH !== "",
  }));

export type OrgLocalConfigType = z.infer<typeof OrgLocalConfigSchema>;

export const ORG_LOCAL_CONFIG_TOKEN = "CONFIG_ORG_LOCAL";

export const OrgLocalConfig: ConfigClass = {
  namespace: "org_local",
  schema: OrgLocalConfigSchema,
};
