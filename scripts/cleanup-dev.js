#!/usr/bin/env node

/**
 * Development environment reset script.
 *
 * Performs:
 * 1) forced port cleanup for tracked dev ports
 * 2) optional stale test database cleanup
 *
 * Usage:
 *   npm run dev:reset
 *   npm run dev:stop
 *   node scripts/cleanup-dev.js --ports-only
 */

const fs = require('fs');
const path = require('path');
const { killPorts } = require('./kill-port');
const { checkPorts } = require('./check-port');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

const LEGACY_PORTS = [3001, 5173];
const TEST_DB_DIR = path.join(__dirname, '..', '.test-dbs');

function getTrackedPorts() {
  loadApiEnv({ overwrite: false });
  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });

  const merged = new Set([apiPort, webPort, ...LEGACY_PORTS]);
  return {
    apiPort,
    webPort,
    ports: Array.from(merged),
  };
}

async function releasePorts(ports) {
  console.log(`[reset] Releasing ports: ${ports.join(', ')}`);
  await killPorts(ports, { force: true, timeout: 3000 });

  const stillInUse = await checkPorts(ports);
  if (stillInUse.size > 0) {
    const detail = Array.from(stillInUse.entries())
      .map(([port, info]) => `${port}(pid=${info.pid}, cmd=${info.command})`)
      .join('; ');
    throw new Error(`Ports still in use after cleanup: ${detail}`);
  }

  console.log('[reset] Port cleanup complete');
}

function cleanupTestDatabases() {
  if (!fs.existsSync(TEST_DB_DIR)) {
    console.log('[reset] No .test-dbs directory found, skipping DB cleanup');
    return { deleted: 0 };
  }

  const files = fs.readdirSync(TEST_DB_DIR);
  const targets = files.filter(
    (file) =>
      file.startsWith('worker-') &&
      (file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'))
  );

  if (targets.length === 0) {
    console.log('[reset] No worker test DB files found, skipping DB cleanup');
    return { deleted: 0 };
  }

  let deleted = 0;
  for (const file of targets) {
    const filePath = path.join(TEST_DB_DIR, file);
    try {
      fs.unlinkSync(filePath);
      deleted += 1;
      console.log(`[reset] Deleted ${file}`);
    } catch (error) {
      console.warn(`[reset] Failed to delete ${file}: ${error.message}`);
    }
  }

  return { deleted };
}

async function resetDevEnvironment(options = {}) {
  const { portsOnly = false } = options;
  const tracked = getTrackedPorts();

  console.log('====================================');
  console.log('Keimenon Dev Reset');
  console.log('====================================');
  console.log(`[reset] Primary ports: api=${tracked.apiPort}, web=${tracked.webPort}`);

  await releasePorts(tracked.ports);

  if (portsOnly) {
    console.log('[reset] Skipping test DB cleanup (--ports-only)');
    return;
  }

  const { deleted } = cleanupTestDatabases();
  console.log(`[reset] Test DB cleanup complete (deleted=${deleted})`);
}

async function main() {
  const args = process.argv.slice(2);
  const portsOnly = args.includes('--ports-only');

  await resetDevEnvironment({ portsOnly });
  console.log('[reset] Done');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[reset] Failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  resetDevEnvironment,
  cleanupTestDatabases,
};
