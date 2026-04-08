#!/usr/bin/env node

const {
  getNodeVersionMismatchMessage,
  isRequiredNodeVersion,
  runShellCommandUnderProjectNode,
} = require('./project-node-runtime');

const args = process.argv.slice(2);
const command = args.join(' ');

if (!command) {
  console.error('[project-node-runner] No command provided.');
  process.exit(1);
}

if (!isRequiredNodeVersion()) {
  console.error(`[project-node-runner] ${getNodeVersionMismatchMessage()}`);
  process.exit(1);
}

const result = runShellCommandUnderProjectNode(command, {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error(`[project-node-runner] Failed to run command: ${result.error.message}`);
}

process.exit(1);
