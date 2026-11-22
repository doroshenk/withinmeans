import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'infra',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000, // the first CDK synth in a file is slow, especially under parallel coverage
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
