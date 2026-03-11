#!/usr/bin/env node

const {
  REQUIRED_NODE_MAJOR,
  REQUIRED_NODE_VERSION,
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
  const expected = REQUIRED_NODE_VERSION || `${REQUIRED_NODE_MAJOR}.x`;
  console.warn(
    `[node22-runner] Current Node is v${process.versions.node}; executing under Node ${expected} via npx.`
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
