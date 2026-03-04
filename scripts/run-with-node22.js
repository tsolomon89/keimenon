#!/usr/bin/env node

const {
  REQUIRED_NODE_MAJOR,
  isRequiredNodeVersion,
  runShellCommandUnderNode22,
} = require('./project-node-runtime');

const args = process.argv.slice(2);
const command = args.join(' ');

if (!command) {
  console.error('[node22-runner] No command provided.');
  process.exit(1);
}

if (!isRequiredNodeVersion()) {
  console.warn(
    `[node22-runner] Current Node is v${process.versions.node}; executing under Node ${REQUIRED_NODE_MAJOR} via npx.`
  );
}

const result = runShellCommandUnderNode22(command, {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error(`[node22-runner] Failed to run command: ${result.error.message}`);
}

process.exit(1);
