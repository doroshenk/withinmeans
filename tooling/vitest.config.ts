import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tooling',
    include: ['**/*.test.ts'],
    exclude: ['**/fixtures/**', '**/node_modules/**'],
  },
});
