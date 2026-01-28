import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // For implicit globals in parsers tests
    include: ['src/**/*.test.ts'],
  },
});
