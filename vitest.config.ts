import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    root: "src",
    globals: true,
    coverage: {
      provider: "v8",
      include: ["**/*.ts"],
      exclude: ["**/*.spec.ts", "**/*.test.ts", "main.ts"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
