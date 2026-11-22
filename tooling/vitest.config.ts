import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tooling',
    include: ['**/*.test.ts'],
    exclude: ['**/fixtures/**', '**/node_modules/**'],
    // These tests spawn ESLint / dependency-cruiser; they slow down when other projects run in parallel.
    testTimeout: 30_000,
  },
});
