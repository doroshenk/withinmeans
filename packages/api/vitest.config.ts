import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing.ts', 'src/index.ts', 'src/lambda.ts'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
