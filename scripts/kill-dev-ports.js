#!/usr/bin/env node

/**
 * Kill configured dev ports.
 */

const { killPorts } = require('./kill-port');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

async function main() {
  loadApiEnv({ overwrite: false });
  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });
  const ports = [webPort, apiPort];

  await killPorts(ports, { force: true, timeout: 3000 });
  console.log(`Requested termination on ports: ${ports.join(', ')}`);
}

main().catch((error) => {
  console.error(`Failed to kill dev ports: ${error.message}`);
  process.exit(1);
});
