import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'db',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // With DSQL_ENDPOINT set (conformance run), clears leftover test schemas first.
    globalSetup: ['./src/testing/globalSetup.ts'],
    // First run starts a Postgres container (and may pull the image).
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/testing/**',
        'src/index.ts',
        'src/cli/migrate.ts',
        // The command wiring: AWS calls only.
        'src/cli/seed.ts',
        'src/cli/lookupClusterEndpoint.ts',
      ],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
