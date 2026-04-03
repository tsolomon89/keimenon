#!/usr/bin/env node

/**
 * Legacy stop wrapper; delegates to canonical dev reset.
 */

const { resetDevEnvironment } = require('./cleanup-dev');

async function main() {
  await resetDevEnvironment({ portsOnly: true });
}

main().catch((error) => {
  console.error(`[dev:stop] Failed: ${error.message}`);
  process.exit(1);
});
