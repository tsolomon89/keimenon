/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests to prepare the test environment.
 * - Creates pristine database snapshot with test user
 * - Verifies API and Web servers are accessible
 * - Validates API module health (detects HMR cache poisoning, module issues)
 *
 * NEW Architecture:
 * - Database snapshot contains: schema + test user + zero data
 * - Workers restore from snapshot (perfect isolation)
 * - Savepoints ensure atomic cleanup after each test
 * - Module health validation fails fast if critical services not loaded
 */

import { chromium, FullConfig } from '@playwright/test';
import { DatabaseSnapshotManager } from './fixtures/database-snapshots';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4001';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

import fs from 'fs';
import path from 'path';

function logDebug(msg: string) {
  fs.appendFileSync('global-setup-debug.log', msg + '\n');
  console.log(msg);
}

async function globalSetup(_config: FullConfig) {
  logDebug('\n🔧 Running E2E Global Setup...\n');

  const baseURL = BASE_URL;

  // Launch browser for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    logDebug(`📡 Checking if API is accessible at ${API_BASE_URL}...`);

    // Check if API is accessible
    const healthResponse = await page.request.get(`${API_BASE_URL}/health`);
    if (!healthResponse.ok()) {
      throw new Error(
        `❌ API server not accessible at ${API_BASE_URL}/health (status: ${healthResponse.status()})`
      );
    }
    logDebug('✅ API server is accessible\n');

    logDebug('🔍 Validating API module health...');

    // Check module health
    const modulesResponse = await page.request.get(`${API_BASE_URL}/health/modules`);
    if (!modulesResponse.ok()) {
         logDebug('❌ API modules health check failed status: ' + modulesResponse.status());
         throw new Error('API modules check failed');
    }
    const modulesData = await modulesResponse.json();
    if (!modulesData.healthy) {
        logDebug('❌ API modules not healthy: ' + JSON.stringify(modulesData));
        throw new Error('API modules not healthy');
    }
    logDebug('✅ All API modules are healthy\n');

    // CRITICAL: Check if test helper routes (savepoints) are available
    logDebug('🔍 Checking savepoint API availability at ' + `${API_BASE_URL}/api/v1/test/status`);
    const savepointResponse = await page.request.get(`${API_BASE_URL}/api/v1/test/status`);
    if (!savepointResponse.ok()) {
      const status = savepointResponse.status();
      logDebug(`❌ Savepoint API not available (status: ${status})`);
      throw new Error(`Savepoint API failed with status ${status}`);
    } else {
      logDebug('✅ Savepoint API available (fast transactional isolation enabled)\n');
    }

    logDebug(`📡 Checking if Web server is accessible at ${baseURL}...`);

    // Check if Web is accessible
    const webResponse = await page.request.get(baseURL);
    if (!webResponse.ok()) {
      throw new Error(
        `❌ Web server not accessible at ${baseURL} (status: ${webResponse.status()})`
      );
    }
    logDebug('✅ Web server is accessible\n');

    // Create database snapshot template
    const snapshotManager = new DatabaseSnapshotManager();
    await snapshotManager.createSnapshot();

    logDebug('✅ Global setup complete\n');
  } catch (error) {
    logDebug('\n❌ Global setup failed: ' + error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
