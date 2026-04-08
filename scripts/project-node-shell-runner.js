#!/usr/bin/env node

const { spawnSync } = require('child_process');

const command = process.argv.slice(2).join(' ');

if (!command) {
  console.error('[project-node-shell-runner] No command provided.');
  process.exit(1);
}

const result = spawnSync(command, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error(`[project-node-shell-runner] Failed to run command: ${result.error.message}`);
}

process.exit(1);
