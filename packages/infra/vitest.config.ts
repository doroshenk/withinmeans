import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'infra',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000, // the first CDK synth in a run is slow
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
