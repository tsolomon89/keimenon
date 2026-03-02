import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'src/hooks/useJobStream.test.ts',
      'src/hooks/__tests__/useChunkedUpload.test.ts',
      'src/hooks/__tests__/useJobStream.test.tsx',
      'src/components/inspector/UserDetailInspector.test.tsx',
      'src/components/specs/settings.spec.ts',
      'src/components/specs/users.spec.ts',
      'src/components/__tests__/settings-workflow.test.tsx',
      'src/components/__tests__/user-management-workflow.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        'dist/',
        '.next/',
      ],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
