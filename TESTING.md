# Testing Guide

This project uses a unified testing strategy to ensure reliability across the `apps` and `packages`.

## 1. Overview

- **Unit & Integration Tests**: Run via **Vitest** (Fast, Watch mode supported).
- **End-to-End Tests**: Run via **Playwright** (Full browser testing).

## 2. Running Tests

### 2.1 From Root (All Tests)

To run all unit/integration tests across the entire workspace:

```bash
npx turbo run test
```

### 2.2 Specific Package

To run tests for a specific package/app, navigate to the directory and run:

```bash
cd apps/api
npx vitest run
```

Or for watch mode:

```bash
npx vitest
```

### 2.3 End-to-End Tests

To run E2E tests (requires `apps/web` and `apps/api` to be running):

```bash
npm run e2e
```

## 3. Directory Structure

- **Unit Tests**: Co-located with source files `__tests__` directories (e.g., `src/services/__tests__/*.test.ts`).
- **Integration Tests**: `tests/integration/` (Root level) or `__tests__` in packages for deeper flows.
- **E2E Tests**: `tests/e2e/` (Root level).

## 4. Guidelines

- **New features** should include unit tests.
- **Critical paths** should include integration/E2E tests.
- **Do NOT** use `node --test` or ad-hoc `test-*.js` scripts anymore. Use `vitest`.
- **Database Tests**: Use the `GroupingStorage` wrapper and in-memory/temp-file SQLite databases for isolation.

## 5. Troubleshooting

- **Database Locks**: If tests fail with database locking errors, ensure you are not running conflicting tests in parallel against the same file path. Vitest runs files in parallel; tests within a file run sequentially. Use unique temp paths in `beforeEach` (e.g., `path.join(os.tmpdir(), 'test-' + Date.now() + '.db')`).
- **Imports**: Ensure imports use correct aliases or relative paths. `apps/api` path aliases (`@keimenon/*`) are handled via `vite-tsconfig-paths`.
- **FTS5**: Some advanced search features (FTS5) require the environment's SQLite build to support it. If missing, some tests may need to be skipped or mocked.
