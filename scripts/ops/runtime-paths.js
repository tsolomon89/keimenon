#!/usr/bin/env node

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { loadApiEnv } = require('../dev-runtime-config');

function expandHome(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return rawPath;
  }

  if (rawPath.startsWith('~')) {
    return path.join(os.homedir(), rawPath.slice(1));
  }

  return rawPath;
}

function resolveRuntimePaths() {
  loadApiEnv({ overwrite: false });

  const defaultDbPath = path.join(os.homedir(), '.canvas-memory', 'canvas.db');
  const dbPath = path.resolve(
    expandHome(process.env.SQLITE_PATH || process.env.DB_PATH || defaultDbPath)
  );

  const localDocsRootRaw = process.env.LOCAL_DOCS_PATH || path.dirname(dbPath);
  const localDocsRoot = path.resolve(expandHome(localDocsRootRaw));

  const storagePathRaw = process.env.STORAGE_PATH || './storage';
  const storagePath = path.isAbsolute(storagePathRaw)
    ? path.resolve(expandHome(storagePathRaw))
    : path.resolve(localDocsRoot, storagePathRaw);

  return {
    dbPath,
    localDocsRoot,
    storagePath,
  };
}

function getKnownDatabaseCandidates(canonicalDbPath) {
  const homeDir = os.homedir();
  const repoRoot = path.resolve(__dirname, '..', '..');
  const candidates = [
    canonicalDbPath,
    process.env.SQLITE_PATH,
    process.env.DB_PATH,
    path.join(homeDir, '.canvas-memory', 'canvas.db'),
    path.join(homeDir, '.keimenon', 'canvas.db'),
    path.join(homeDir, '.keimenon', 'keimenon.db'),
    path.join(repoRoot, 'keimenon.db'),
    path.join(repoRoot, '.keimenon.db'),
    path.join(repoRoot, 'apps', 'api', 'keimenon.db'),
  ]
    .filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => path.resolve(expandHome(candidate)));

  return [...new Set(candidates)];
}

function getExistingDatabaseCandidates(canonicalDbPath) {
  return getKnownDatabaseCandidates(canonicalDbPath).filter((candidate) =>
    fs.existsSync(candidate)
  );
}

module.exports = {
  resolveRuntimePaths,
  getKnownDatabaseCandidates,
  getExistingDatabaseCandidates,
};
