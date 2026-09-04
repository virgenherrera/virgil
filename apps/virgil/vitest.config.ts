import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/shared/index.ts', 'src/main.ts'],
      reportsDirectory: 'artifacts/coverage',
      reporter: ['json', 'html', 'text'],
      thresholds: {
        statements: 97,
        lines: 97,
        functions: 97,
      },
    },
  },
});
