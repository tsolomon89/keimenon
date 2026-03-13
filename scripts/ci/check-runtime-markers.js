#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOTS = ['apps/api/src', 'apps/web/src', 'packages'];

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_PATH_PATTERNS = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}tests${path.sep}`,
  `${path.sep}test${path.sep}`,
  `${path.sep}e2e${path.sep}`,
  '.test.',
  '.spec.',
];

const RUNTIME_ALLOWLIST_LINE_PATTERNS = [/@keimenon\/tool-adapters\/testing\b/];

const MARKERS = [
  { name: '@keimenon/agents', regex: /@keimenon\/agents\b/g },
  { name: 'legacy packages/agents reference', regex: /packages\/agents\b/g },
  { name: 'mock fallback', regex: /mock fallback/gi },
  { name: 'fallback to mock', regex: /falling back to mock|fallback to mock/gi },
  { name: 'mock implementation', regex: /\bmock implementation\b/gi },
  { name: 'mock poc marker', regex: /\bmock\b.*\bpoc\b|\bpoc\b.*\bmock\b/gi },
  { name: 'synthetic output', regex: /synthetic output/gi },
  { name: 'runtime todo mock debt', regex: /todo.*(mock|fallback|synthetic)/gi },
  { name: 'legacy /api/v1/ai', regex: /\/api\/v1\/ai\//g },
  { name: 'legacy /api/v1/verification', regex: /\/api\/v1\/verification\//g },
  { name: 'ai.routes reference', regex: /\bai\.routes\b/g },
  { name: 'verification.routes reference', regex: /\bverification\.routes\b/g },
];

function listTrackedLegacyAgentsFiles() {
  const result = spawnSync('git', ['ls-files', '--', 'packages/agents'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(
      `Unable to verify tracked legacy files via git ls-files: ${stderr || 'unknown git error'}`
    );
  }

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isTestPath(filePath) {
  return TEST_PATH_PATTERNS.some((fragment) => filePath.includes(fragment));
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

    if (!CODE_FILE_RE.test(entry.name)) {
      continue;
    }

    if (isTestPath(fullPath)) {
      continue;
    }

    output.push(fullPath);
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (RUNTIME_ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    for (const marker of MARKERS) {
      marker.regex.lastIndex = 0;
      if (marker.regex.test(line)) {
        violations.push({
          filePath,
          line: i + 1,
          marker: marker.name,
          snippet: line.trim(),
        });
      }
    }
  }

  return violations;
}

function main() {
  let trackedLegacyFiles = [];
  try {
    trackedLegacyFiles = listTrackedLegacyAgentsFiles();
  } catch (error) {
    console.error(`[mock-ban] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (trackedLegacyFiles.length > 0) {
    console.error(
      `[mock-ban] FAIL tracked legacy workspace paths detected under packages/agents (${trackedLegacyFiles.length})`
    );
    for (const trackedPath of trackedLegacyFiles) {
      console.error(`- ${trackedPath}`);
    }
    process.exit(1);
  }

  const files = [];
  for (const root of ROOTS) {
    collectFiles(path.resolve(root), files);
  }

  const allViolations = [];
  for (const filePath of files) {
    allViolations.push(...scanFile(filePath));
  }

  if (allViolations.length === 0) {
    console.log(
      `[mock-ban] PASS scanned=${files.length} files markers=${MARKERS.length} violations=0`
    );
    return;
  }

  console.error(`[mock-ban] FAIL violations=${allViolations.length}`);
  for (const violation of allViolations) {
    console.error(
      `- ${path.relative(process.cwd(), violation.filePath)}:${violation.line} [${violation.marker}] ${violation.snippet}`
    );
  }
  process.exit(1);
}

main();
