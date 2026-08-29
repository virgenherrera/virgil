import { z } from "zod";
import type { ConfigClass } from "./app-config.module.js";

const VerificationGatesConfigSchema = z
  .object({
    VIRGIL_COVERAGE_THRESHOLD: z.string().optional(),
    VIRGIL_TYPE_CHECK: z.string().optional(),
    VIRGIL_MAX_CRITICAL_CVES: z.string().optional(),
  })
  .transform((data) => ({
    coverageThreshold: data.VIRGIL_COVERAGE_THRESHOLD
      ? parseInt(data.VIRGIL_COVERAGE_THRESHOLD, 10)
      : undefined,
    typeCheck: data.VIRGIL_TYPE_CHECK === "true",
    maxCriticalCves:
      data.VIRGIL_MAX_CRITICAL_CVES !== undefined
        ? parseInt(data.VIRGIL_MAX_CRITICAL_CVES, 10)
        : undefined,
    configured: Boolean(
      data.VIRGIL_COVERAGE_THRESHOLD ||
        data.VIRGIL_TYPE_CHECK === "true" ||
        data.VIRGIL_MAX_CRITICAL_CVES !== undefined,
    ),
    partial: false,
  }));

export type VerificationGatesConfigType = z.infer<
  typeof VerificationGatesConfigSchema
>;

export const VERIFICATION_GATES_CONFIG_TOKEN = "CONFIG_VERIFICATION_GATES";

export const VerificationGatesConfig: ConfigClass = {
  namespace: "verification_gates",
  schema: VerificationGatesConfigSchema,
};
