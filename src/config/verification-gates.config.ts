import { z } from "zod";
import type { ConfigClass } from "./app-config.module.js";

const VerificationGatesConfigSchema = z
  .object({
    VIRGIL_COVERAGE_THRESHOLD: z.string().optional(),
    VIRGIL_TYPE_CHECK: z.string().optional(),
    VIRGIL_MAX_CRITICAL_CVES: z.string().optional(),
    VIRGIL_MAX_COMPLEXITY: z.string().optional(),
    VIRGIL_CHECK_CIRCULAR_DEPS: z.string().optional(),
    VIRGIL_MAX_MAJOR_OUTDATED: z.string().optional(),
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
    maxComplexity: data.VIRGIL_MAX_COMPLEXITY
      ? parseInt(data.VIRGIL_MAX_COMPLEXITY, 10)
      : undefined,
    checkCircularDeps: data.VIRGIL_CHECK_CIRCULAR_DEPS === "true",
    maxMajorOutdated:
      data.VIRGIL_MAX_MAJOR_OUTDATED !== undefined
        ? parseInt(data.VIRGIL_MAX_MAJOR_OUTDATED, 10)
        : undefined,
    configured: Boolean(
      data.VIRGIL_COVERAGE_THRESHOLD ||
        data.VIRGIL_TYPE_CHECK === "true" ||
        data.VIRGIL_MAX_CRITICAL_CVES !== undefined ||
        data.VIRGIL_MAX_COMPLEXITY ||
        data.VIRGIL_CHECK_CIRCULAR_DEPS === "true" ||
        data.VIRGIL_MAX_MAJOR_OUTDATED !== undefined,
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
