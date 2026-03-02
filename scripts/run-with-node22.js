#!/usr/bin/env node

const { spawnSync } = require('child_process');

const REQUIRED_MAJOR = 22;
const args = process.argv.slice(2);
const command = args.join(' ');

if (!command) {
  console.error('[node22-runner] No command provided.');
  process.exit(1);
}

const currentMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

function run(cmd, extraEnv = {}) {
  const result = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  if (result.error) {
    console.error(`[node22-runner] Failed to run command: ${result.error.message}`);
  }

  process.exit(1);
}

if (currentMajor === REQUIRED_MAJOR) {
  run(command);
}

console.warn(
  `[node22-runner] Current Node is v${process.versions.node}; executing under Node ${REQUIRED_MAJOR} via npx.`
);

const escaped = command.replace(/"/g, '\\"');
run(`npx -y -p node@${REQUIRED_MAJOR} -c "${escaped}"`, {
  KEIMENON_BYPASS_NODE_CHECK: '1',
});
