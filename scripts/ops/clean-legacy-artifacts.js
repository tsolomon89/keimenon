#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const LEGACY_ARTIFACT_TARGETS = [
  'packages/agents/.turbo',
  'packages/agents/dist',
  'packages/agents/node_modules',
  'packages/agents/tsconfig.tsbuildinfo',
];

function removeTarget(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { relativePath, removed: false, reason: 'not-found' };
  }

  const stats = fs.lstatSync(absolutePath);
  if (stats.isDirectory()) {
    fs.rmSync(absolutePath, { recursive: true, force: true });
    return { relativePath, removed: true, reason: 'directory' };
  }

  fs.rmSync(absolutePath, { force: true });
  return { relativePath, removed: true, reason: 'file' };
}

function main() {
  const results = [];
  for (const target of LEGACY_ARTIFACT_TARGETS) {
    results.push(removeTarget(target));
  }

  const removedCount = results.filter((result) => result.removed).length;
  console.log(`[clean-legacy-artifacts] removed=${removedCount} checked=${results.length}`);
  for (const result of results) {
    console.log(
      `- ${result.relativePath} ${result.removed ? `(removed:${result.reason})` : '(not-found)'}`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[clean-legacy-artifacts] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
