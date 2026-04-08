#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { REQUIRED_NODE_MAJOR, isRequiredNodeVersion } = require('./project-node-runtime');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    console.error(
      `[runtime-repair] Failed running "${command} ${args.join(' ')}": ${result.error.message}`
    );
    process.exit(1);
  }
}

function main() {
  if (!isRequiredNodeVersion()) {
    console.error(
      `[runtime-repair] Node ${REQUIRED_NODE_MAJOR}.x is required. Active runtime: v${process.versions.node}`
    );
    console.error(
      `[runtime-repair] Switch to Node ${REQUIRED_NODE_MAJOR}, then rerun this command.`
    );
    process.exit(1);
  }

  const skipDesktop = process.argv.includes('--skip-desktop');

  if (!skipDesktop) {
    console.log('[runtime-repair] Rebuilding desktop Electron native dependencies...');
    run('npm', ['run', 'desktop:rebuild-native']);
  }

  console.log(
    '[runtime-repair] Rebuilding better-sqlite3 for the active Node runtime after desktop rebuild...'
  );
  run('npm', ['rebuild', 'better-sqlite3']);

  console.log('[runtime-repair] Verifying Node + SQLite runtime health...');
  run('npm', ['run', 'doctor:runtime']);

  console.log('[runtime-repair] Runtime repair complete.');
}

main();
