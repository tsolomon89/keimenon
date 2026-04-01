#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RUNTIME_ROOTS = ['apps/api/src', 'apps/web/src', 'packages'];
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_PATH_FRAGMENTS = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}tests${path.sep}`,
  `${path.sep}test${path.sep}`,
  `${path.sep}e2e${path.sep}`,
  '.test.',
  '.spec.',
];

const ALLOWLIST_PATH_FRAGMENTS = [
  `${path.sep}docs${path.sep}`,
  `${path.sep}agent_context${path.sep}`,
];
const ALLOWLIST_LINE_PATTERNS = [/@keimenon\/tool-adapters\/testing\b/];

const DISALLOWED_TRACKED_ROOT_ARTIFACTS = [
  'api_build_log.txt',
  'api_test_error.txt',
  'api_test_error_2.txt',
  'build_tail.txt',
  'cleaned_log.txt',
  'db_dump.json',
  'debug-jobs-db.js',
  'debug_db.ts',
  'delete_diag_output.json',
  'delete_diag_output_v2.json',
  'delete_diag_output_v3.json',
  'diagnosis.txt',
  'error_output.txt',
  'full_output.txt',
  'install_log.txt',
  'install_log_recovery.txt',
  'install_verbose.txt',
  'manual_delete_output.txt',
  'manual_delete_output_v2.txt',
  'rebuild_log.txt',
  'test_e2e_error.txt',
  'test_log.txt',
  'test_log_final.txt',
  'test_log_integration.txt',
  'test_output.txt',
  'test-es.ts',
  'verify_db.js',
];

const FORBIDDEN_RUNTIME_FILES = [
  'apps/api/src/routes/cluster.routes.ts',
  'apps/api/src/routes/review-queue.routes.ts',
  'apps/api/src/routes/duplicates.ts',
  'apps/api/src/routes/groups.ts',
  'apps/api/src/services/AccountWriteQueueManager.ts',
  'apps/api/src/services/OptimisticLockService.ts',
  'apps/api/src/services/llm.service.ts',
  'apps/api/src/services/organization-service.ts',
  'apps/api/src/services/similarity-engine.ts',
  'apps/api/src/services/sources-builder.ts',
  'apps/api/src/services/sources-service.ts',
  'apps/api/src/services/code-extractor.ts',
  'apps/web/src/components/keimenon/BatchActionsToolbar.tsx',
  'apps/web/src/components/keimenon/GraphControls.tsx',
  'apps/web/src/components/keimenon/GroupCard.tsx',
  'apps/web/src/components/keimenon/SourceTreeView.tsx',
  'apps/web/src/components/primitives/index.ts',
  'apps/web/src/components/tokens/design-tokens.ts',
];

const API_ROUTE_UNMOUNTED_ALLOWLIST = new Set([]);

const RUNTIME_DEBUG_MARKERS = [
  { name: 'reset-password-debug', regex: /reset-password-debug/g },
  { name: 'Forgot password? (debug)', regex: /Forgot password\? \(debug\)/g },
  { name: 'Reset Password (Debug)', regex: /Reset Password \(Debug\)/g },
  { name: '/api/debug-env', regex: /\/api\/debug-env/g },
  { name: '/debug-client-env', regex: /\/debug-client-env/g },
];

function isAllowlistedPath(filePath) {
  return ALLOWLIST_PATH_FRAGMENTS.some((fragment) => filePath.includes(fragment));
}

function isTestPath(filePath) {
  return TEST_PATH_FRAGMENTS.some((fragment) => filePath.includes(fragment));
}

function listTrackedArtifacts() {
  const result = spawnSync('git', ['ls-files', '--', ...DISALLOWED_TRACKED_ROOT_ARTIFACTS], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`git ls-files failed: ${stderr || 'unknown git error'}`);
  }

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listTrackedFiles(paths) {
  const result = spawnSync('git', ['ls-files', '--', ...paths], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`git ls-files failed: ${stderr || 'unknown git error'}`);
  }

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listUnmountedApiRouteFiles() {
  const routesDir = path.resolve('apps/api/src/routes');
  const appFilePath = path.resolve('apps/api/src/app.ts');

  if (!fs.existsSync(routesDir) || !fs.existsSync(appFilePath)) {
    return [];
  }

  const appFile = fs.readFileSync(appFilePath, 'utf8');
  const importRegex = /from '\.\/routes\/([^']+)'/g;
  const mountedRouteModules = new Set();
  let match;
  while ((match = importRegex.exec(appFile)) !== null) {
    mountedRouteModules.add(match[1]);
  }

  const routeFiles = fs
    .readdirSync(routesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith('.test.ts') && !name.endsWith('.spec.ts'));

  return routeFiles
    .filter((fileName) => !API_ROUTE_UNMOUNTED_ALLOWLIST.has(fileName))
    .filter((fileName) => {
      const moduleName = fileName.replace(/\.ts$/, '');
      return !mountedRouteModules.has(moduleName);
    })
    .map((fileName) => `apps/api/src/routes/${fileName}`);
}

function collectFiles(startDir, output) {
  if (!fs.existsSync(startDir)) {
    return;
  }

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') {
        continue;
      }
      collectFiles(fullPath, output);
      continue;
    }

    if (!entry.isFile() || !CODE_FILE_RE.test(entry.name)) {
      continue;
    }

    if (isTestPath(fullPath) || isAllowlistedPath(fullPath)) {
      continue;
    }

    output.push(fullPath);
  }
}

function scanFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }

    for (const marker of RUNTIME_DEBUG_MARKERS) {
      marker.regex.lastIndex = 0;
      if (!marker.regex.test(line)) {
        continue;
      }

      violations.push({
        filePath,
        line: index + 1,
        marker: marker.name,
        snippet: line.trim(),
      });
    }
  }

  return violations;
}

function main() {
  const trackedArtifacts = listTrackedArtifacts();
  if (trackedArtifacts.length > 0) {
    console.error(
      `[repo-hygiene] FAIL tracked root diagnostic artifacts detected (${trackedArtifacts.length})`
    );
    for (const artifact of trackedArtifacts) {
      console.error(`- ${artifact}`);
    }
    process.exit(1);
  }

  const forbiddenRuntimeFiles = listTrackedFiles(FORBIDDEN_RUNTIME_FILES);
  if (forbiddenRuntimeFiles.length > 0) {
    console.error(
      `[repo-hygiene] FAIL forbidden legacy runtime files detected (${forbiddenRuntimeFiles.length})`
    );
    for (const filePath of forbiddenRuntimeFiles) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
  }

  const unmountedApiRoutes = listUnmountedApiRouteFiles();
  if (unmountedApiRoutes.length > 0) {
    console.error(
      `[repo-hygiene] FAIL unmounted API route files detected (${unmountedApiRoutes.length})`
    );
    for (const routeFile of unmountedApiRoutes) {
      console.error(`- ${routeFile}`);
    }
    process.exit(1);
  }

  const files = [];
  for (const root of RUNTIME_ROOTS) {
    collectFiles(path.resolve(root), files);
  }

  const violations = [];
  for (const file of files) {
    violations.push(...scanFile(file));
  }

  if (violations.length > 0) {
    console.error(`[repo-hygiene] FAIL runtime debug markers detected (${violations.length})`);
    for (const violation of violations) {
      console.error(
        `- ${path.relative(process.cwd(), violation.filePath)}:${violation.line} [${violation.marker}] ${violation.snippet}`
      );
    }
    process.exit(1);
  }

  console.log(
    `[repo-hygiene] PASS scanned=${files.length} markers=${RUNTIME_DEBUG_MARKERS.length} trackedArtifacts=0`
  );
}

try {
  main();
} catch (error) {
  console.error(`[repo-hygiene] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
