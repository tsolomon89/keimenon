#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const SAFE_TARGETS = [
  '.test-dbs',
  '.turbo',
  'playwright-report',
  'playwright-report-smoke',
  'apps/api/dist',
  'apps/web/.next',
  'apps/web/out',
  'apps/desktop/dist',
  'apps/desktop/out',
  'test-results/diagnostics',
];

const EMPTY_LEGACY_DIRS = [
  'packages/agents',
  'apps/web/src/components/adapters',
  'apps/api/src/modules/shared',
  'apps/api/src/services/alerts',
];

function removeTarget(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { target: relativePath, removed: false, reason: 'not-found' };
  }

  const stats = fs.lstatSync(absolutePath);
  if (stats.isDirectory()) {
    fs.rmSync(absolutePath, { recursive: true, force: true });
    return { target: relativePath, removed: true, reason: 'directory' };
  }

  fs.rmSync(absolutePath, { force: true });
  return { target: relativePath, removed: true, reason: 'file' };
}

function removeIfEmpty(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { target: relativePath, removed: false, reason: 'not-found' };
  }

  const stats = fs.lstatSync(absolutePath);
  if (!stats.isDirectory()) {
    return { target: relativePath, removed: false, reason: 'not-directory' };
  }

  const entries = fs.readdirSync(absolutePath);
  if (entries.length > 0) {
    return { target: relativePath, removed: false, reason: 'not-empty' };
  }

  fs.rmSync(absolutePath, { recursive: true, force: true });
  return { target: relativePath, removed: true, reason: 'empty-directory' };
}

function collectWorkspaceBuildTargets(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  const targets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const base = path.join(rootDir, entry.name);
    targets.push(path.join(base, 'dist'));
    targets.push(path.join(base, 'out'));
    targets.push(path.join(base, '.turbo'));
  }

  return targets;
}

function collectDataTargets() {
  const dataTargets = ['.keimenon'];
  const rootEntries = fs.readdirSync(process.cwd(), { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }

    if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
      dataTargets.push(entry.name);
    }
  }

  return dataTargets;
}

function main() {
  const includeData = process.argv.includes('--include-data');

  const removalTargets = new Set(SAFE_TARGETS);
  for (const target of collectWorkspaceBuildTargets('apps')) {
    removalTargets.add(target);
  }
  for (const target of collectWorkspaceBuildTargets('packages')) {
    removalTargets.add(target);
  }

  const removed = [];
  for (const target of removalTargets) {
    removed.push(removeTarget(target));
  }

  for (const legacyDir of EMPTY_LEGACY_DIRS) {
    removed.push(removeIfEmpty(legacyDir));
  }

  if (includeData) {
    for (const dataTarget of collectDataTargets()) {
      removed.push(removeTarget(dataTarget));
    }
  }

  const removedCount = removed.filter((result) => result.removed).length;
  console.log(
    `[clean-repo-local] removed=${removedCount} checked=${removed.length} includeData=${includeData}`
  );
  for (const result of removed) {
    const status = result.removed ? `removed:${result.reason}` : result.reason;
    console.log(`- ${result.target} (${status})`);
  }

  if (!includeData) {
    console.log(
      '[clean-repo-local] data-safe mode: .env*, database files, and user data were not removed'
    );
    console.log('[clean-repo-local] pass --include-data to opt-in to local data cleanup');
  }
}

try {
  main();
} catch (error) {
  console.error(`[clean-repo-local] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
