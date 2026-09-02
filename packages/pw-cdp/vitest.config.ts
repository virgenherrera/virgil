import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './artifacts/coverage',
      reporter: ['json', 'html', 'text'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 97,
        lines: 97,
        functions: 97,
      },
    },
  },
});
