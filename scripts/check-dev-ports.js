#!/usr/bin/env node

/**
 * Check configured dev ports and return non-zero if occupied.
 */

const { checkPorts } = require('./check-port');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

async function main() {
  loadApiEnv({ overwrite: false });
  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });
  const ports = [webPort, apiPort];

  const conflicts = await checkPorts(ports);
  if (conflicts.size === 0) {
    console.log(`Ports are free: ${ports.join(', ')}`);
    process.exit(0);
  }

  console.error('Port conflicts detected:');
  for (const [port, info] of conflicts.entries()) {
    console.error(`- ${port} pid=${info.pid} cmd=${info.command}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(`Failed to check dev ports: ${error.message}`);
  process.exit(2);
});
