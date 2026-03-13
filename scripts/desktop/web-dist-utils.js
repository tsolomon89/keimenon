#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const WEB_DIST_DIR = path.resolve('apps/desktop/resources/web-dist');
const WEB_OUT_DIR = path.resolve('apps/web/out');
const MANIFEST_FILENAME = '.web-dist-manifest.json';

const SOURCE_TARGETS = [
  'apps/web/src',
  'apps/web/public',
  'apps/web/next.config.js',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
  'apps/web/postcss.config.js',
  'apps/web/tailwind.config.ts',
  'package-lock.json',
  'packages/types/src',
  'packages/ui/src',
  'packages/graph/src',
  'packages/parsers/src',
];

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'out',
  'dist',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
  'playwright-report-smoke',
]);

const FORBIDDEN_WEB_DIST_PATHS = ['/debug-client-env', '/api/debug-env'];
const FORBIDDEN_WEB_DIST_MARKERS = [
  '/debug-client-env',
  '/api/debug-env',
  'reset-password-debug',
  'Forgot password? (debug)',
  'Reset Password (Debug)',
];

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function collectFilesFromDirectory(rootDir, currentDir, output) {
  if (!fs.existsSync(currentDir)) {
    return;
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      collectFilesFromDirectory(rootDir, fullPath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = normalizeSlashes(path.relative(process.cwd(), fullPath));
    output.push(relativePath);
  }
}

function collectSourceFiles() {
  const files = [];

  for (const target of SOURCE_TARGETS) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      continue;
    }

    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      collectFilesFromDirectory(resolved, resolved, files);
      continue;
    }

    if (stats.isFile()) {
      files.push(normalizeSlashes(path.relative(process.cwd(), resolved)));
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function computeSourceFingerprint() {
  const files = collectSourceFiles();
  const hash = crypto.createHash('sha256');

  for (const relativePath of files) {
    const absolutePath = path.resolve(relativePath);
    const content = fs.readFileSync(absolutePath);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  return {
    fingerprint: hash.digest('hex'),
    fileCount: files.length,
  };
}

function getManifestPath(webDistDir = WEB_DIST_DIR) {
  return path.join(webDistDir, MANIFEST_FILENAME);
}

function writeManifest(webDistDir, manifest) {
  const manifestPath = getManifestPath(webDistDir);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function readManifest(webDistDir = WEB_DIST_DIR) {
  const manifestPath = getManifestPath(webDistDir);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function collectWebDistFiles(webDistDir = WEB_DIST_DIR) {
  if (!fs.existsSync(webDistDir)) {
    return [];
  }

  const files = [];

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push(normalizeSlashes(path.relative(webDistDir, fullPath)));
    }
  };

  walk(webDistDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function scanWebDistForForbiddenContent(webDistDir = WEB_DIST_DIR) {
  const files = collectWebDistFiles(webDistDir);
  const violations = [];

  for (const relativePath of files) {
    const normalized = `/${relativePath}`;
    for (const forbiddenPath of FORBIDDEN_WEB_DIST_PATHS) {
      if (normalized === forbiddenPath || normalized.startsWith(`${forbiddenPath}/`)) {
        violations.push({ type: 'path', file: relativePath, marker: forbiddenPath });
      }
    }

    const extension = path.extname(relativePath).toLowerCase();
    const shouldScanContent = extension === '.html' || extension === '.txt' || extension === '.js';
    if (!shouldScanContent) {
      continue;
    }

    const absolutePath = path.join(webDistDir, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const marker of FORBIDDEN_WEB_DIST_MARKERS) {
      if (content.includes(marker)) {
        violations.push({ type: 'content', file: relativePath, marker });
      }
    }
  }

  return violations;
}

module.exports = {
  WEB_DIST_DIR,
  WEB_OUT_DIR,
  MANIFEST_FILENAME,
  computeSourceFingerprint,
  collectWebDistFiles,
  scanWebDistForForbiddenContent,
  readManifest,
  writeManifest,
};
