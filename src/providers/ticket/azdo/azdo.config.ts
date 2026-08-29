import { z } from "zod";
import type { ConfigClass } from "../../../config/app-config.module.js";

const AzdoConfigSchema = z
  .object({
    VIRGIL_AZDO_ORG_URL: z.string().optional(),
    VIRGIL_AZDO_PROJECT: z.string().optional(),
    VIRGIL_AZDO_PAT: z.string().optional(),
  })
  .transform((data) => {
    const fields = [
      data.VIRGIL_AZDO_ORG_URL,
      data.VIRGIL_AZDO_PROJECT,
      data.VIRGIL_AZDO_PAT,
    ];
    const setCount = fields.filter(Boolean).length;
    const configured = setCount === 3;
    const partial = setCount > 0 && setCount < 3;

    return {
      orgUrl: data.VIRGIL_AZDO_ORG_URL ?? "",
      project: data.VIRGIL_AZDO_PROJECT ?? "",
      pat: data.VIRGIL_AZDO_PAT ?? "",
      configured,
      partial,
    };
  });

export type AzdoConfigType = z.infer<typeof AzdoConfigSchema>;

export const AZDO_CONFIG_TOKEN = "CONFIG_AZDO";

export const AzdoConfig: ConfigClass = {
  namespace: "azdo",
  schema: AzdoConfigSchema,
};
