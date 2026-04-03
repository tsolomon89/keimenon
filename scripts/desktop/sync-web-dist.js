#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runScript(scriptPath) {
  const absolute = path.resolve(scriptPath);
  const result = spawnSync(process.execPath, [absolute], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status !== 'number' || result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  runScript('scripts/desktop/refresh-web-dist.js');
  runScript('scripts/desktop/verify-web-dist.js');
  console.log('[desktop-web-dist] sync complete');
} catch (error) {
  console.error(`[desktop-web-dist] sync failed: ${error.message}`);
  process.exit(1);
}
