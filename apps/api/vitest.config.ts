import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup-global.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
