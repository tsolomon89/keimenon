#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  WEB_DIST_DIR,
  WEB_OUT_DIR,
  computeSourceFingerprint,
  scanWebDistForForbiddenContent,
  writeManifest,
} = require('./web-dist-utils');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status !== 'number' || result.status !== 0) {
    console.error(
      `[desktop-web-dist] command failed: ${command} ${args.join(' ')} (status=${result.status})`
    );
    process.exit(result.status || 1);
  }
}

function copyWebOutToDesktop() {
  if (!fs.existsSync(WEB_OUT_DIR)) {
    console.error(`[desktop-web-dist] Missing export output at ${WEB_OUT_DIR}`);
    process.exit(1);
  }

  fs.rmSync(WEB_DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(WEB_DIST_DIR), { recursive: true });
  fs.cpSync(WEB_OUT_DIR, WEB_DIST_DIR, { recursive: true });
}

function main() {
  const source = computeSourceFingerprint();

  run('npm', ['run', 'build:export', '--workspace=@keimenon/web'], {
    ...process.env,
    NEXT_OUTPUT_EXPORT: '1',
  });

  copyWebOutToDesktop();

  const manifestPath = writeManifest(WEB_DIST_DIR, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/desktop/refresh-web-dist.js',
    buildProfile: 'NEXT_OUTPUT_EXPORT=1',
    sourceFingerprint: source.fingerprint,
    sourceFileCount: source.fileCount,
  });

  const forbidden = scanWebDistForForbiddenContent(WEB_DIST_DIR);
  if (forbidden.length > 0) {
    console.error('[desktop-web-dist] Forbidden debug markers detected after refresh:');
    for (const violation of forbidden) {
      console.error(`- ${violation.type}:${violation.file} marker=${violation.marker}`);
    }
    process.exit(1);
  }

  console.log(
    `[desktop-web-dist] refreshed files copied to ${WEB_DIST_DIR} fingerprint=${source.fingerprint} manifest=${manifestPath}`
  );
}

try {
  main();
} catch (error) {
  console.error(`[desktop-web-dist] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
