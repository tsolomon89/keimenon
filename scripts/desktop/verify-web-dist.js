#!/usr/bin/env node

const fs = require('node:fs');
const {
  WEB_DIST_DIR,
  computeSourceFingerprint,
  scanWebDistForForbiddenContent,
  readManifest,
} = require('./web-dist-utils');

function fail(message) {
  console.error(`[desktop-web-dist] FAIL ${message}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    fail(`missing tracked desktop bundle directory: ${WEB_DIST_DIR}`);
  }

  const manifest = readManifest(WEB_DIST_DIR);
  if (!manifest) {
    fail('missing web-dist manifest; run `npm run desktop:web-dist:refresh`');
  }

  const forbidden = scanWebDistForForbiddenContent(WEB_DIST_DIR);
  if (forbidden.length > 0) {
    fail(
      `forbidden debug markers found (${forbidden.length}): ${forbidden
        .slice(0, 10)
        .map((entry) => `${entry.type}:${entry.file}:${entry.marker}`)
        .join(', ')}`
    );
  }

  const source = computeSourceFingerprint();
  if (manifest.sourceFingerprint !== source.fingerprint) {
    fail(
      `desktop web-dist is out of sync with source fingerprint (manifest=${manifest.sourceFingerprint}, current=${source.fingerprint}); run \`npm run desktop:web-dist:refresh\``
    );
  }

  if (manifest.sourceFileCount !== source.fileCount) {
    fail(
      `desktop web-dist source file count mismatch (manifest=${manifest.sourceFileCount}, current=${source.fileCount})`
    );
  }

  console.log(
    `[desktop-web-dist] PASS fingerprint=${source.fingerprint} files=${source.fileCount} manifestGeneratedAt=${manifest.generatedAt}`
  );
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
