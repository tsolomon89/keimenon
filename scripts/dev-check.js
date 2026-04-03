#!/usr/bin/env node

/**
 * Check whether dev servers are listening on the configured ports.
 * Usage: npm run dev:check
 */

const { checkPorts } = require('./check-port');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

async function main() {
  loadApiEnv({ overwrite: false });
  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });

  const ports = new Map([
    ['api', apiPort],
    ['web', webPort],
  ]);

  console.log(`Checking development servers (api=${apiPort}, web=${webPort})...\n`);

  const conflicts = await checkPorts([apiPort, webPort]);
  let anyRunning = false;

  for (const [name, port] of ports) {
    const info = conflicts.get(port);
    if (info) {
      anyRunning = true;
      console.log(
        `OK   ${name.toUpperCase()} listening on ${port} (pid=${info.pid}, cmd=${info.command})`
      );
    } else {
      console.log(`MISS ${name.toUpperCase()} not listening on ${port}`);
    }
  }

  console.log('');
  if (anyRunning) {
    console.log('To stop dev services: npm run dev:stop');
  } else {
    console.log('No tracked dev services are running. Start with: npm run dev');
  }
}

main().catch((error) => {
  console.error(`Error checking servers: ${error.message}`);
  process.exit(1);
});
