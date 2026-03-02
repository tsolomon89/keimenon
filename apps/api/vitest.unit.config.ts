import { defineConfig } from 'vitest/config';

// Unit test config - no global setup needed (no test server)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/services/__tests__/**/*.test.ts'],
  },
});
