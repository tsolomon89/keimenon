#!/usr/bin/env node

/**
 * One-shot local recovery flow:
 * 1) stop dev processes
 * 2) run global-sweep full fresh reset (admin preserved)
 * 3) repair settings schema
 * 4) print reset status
 * 5) assert clean baseline invariants
 * 6) optionally boot desktop stack
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecPath = process.env.npm_execpath;
const repoRoot = path.resolve(__dirname, '..', '..');

function runStep(label, scriptName) {
  console.log(`[recover-fresh-admin] ${label} -> npm run ${scriptName}`);
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, 'run', scriptName], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      })
    : spawnSync(npmCommand, ['run', scriptName], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status !== 'number' || result.status !== 0) {
    throw new Error(`Step failed: npm run ${scriptName} (exit=${result.status ?? 'unknown'})`);
  }
}

function main() {
  const shouldBootDesktop = process.argv.includes('--boot');

  runStep('stop dev processes', 'dev:stop');
  runStep('global sweep reset', 'factory-reset:global-sweep');
  runStep('settings schema repair', 'settings:schema:repair');
  runStep('status report', 'factory-reset:status');
  runStep('clean baseline assertion', 'factory-reset:assert-clean-baseline');

  if (shouldBootDesktop) {
    runStep('desktop clean boot', 'dev:clean:electron');
  }

  console.log('[recover-fresh-admin] complete');
}

try {
  main();
} catch (error) {
  console.error(
    `[recover-fresh-admin] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
