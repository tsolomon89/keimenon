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

async function globalSetup(_config: FullConfig) {
  console.log('\n🔧 Running E2E Global Setup...\n');

  const baseURL = BASE_URL;

  // Launch browser for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    console.log(`📡 Checking if API is accessible at ${API_BASE_URL}...`);

    // Check if API is accessible
    const healthResponse = await page.request.get(`${API_BASE_URL}/health`);
    if (!healthResponse.ok()) {
      throw new Error(
        `❌ API server not accessible at ${API_BASE_URL}/health (status: ${healthResponse.status()})`
      );
    }
    console.log('✅ API server is accessible\n');

    console.log('🔍 Validating API module health...');

    // Check module health to detect HMR cache poisoning and module resolution issues
    const modulesResponse = await page.request.get(`${API_BASE_URL}/health/modules`);
    if (!modulesResponse.ok()) {
      const body = await modulesResponse.json();
      const issues = body.issues || [];
      const issueText = issues.map((i: any) => `  • ${i.module}: ${i.issue}`).join('\n');
      throw new Error(
        `❌ API modules are not healthy (status: ${modulesResponse.status()}):\n${issueText}\n\n` +
          `💡 Recommendations:\n` +
          `  • Restart servers: npm run kill-ports && npm run e2e:dev\n` +
          `  • Clean cache: npm run e2e:clean-cache\n` +
          `  • Diagnose: node scripts/diagnose-modules.js`
      );
    }

    const modulesData = await modulesResponse.json();
    if (!modulesData.healthy) {
      const issues = modulesData.issues || [];
      const issueText = issues.map((i: any) => `  • ${i.module}: ${i.issue}`).join('\n');
      throw new Error(
        `❌ API modules are not healthy:\n${issueText}\n\n` +
          `💡 Recommendations:\n` +
          `  • Restart servers: npm run kill-ports && npm run e2e:dev\n` +
          `  • Check logs: node scripts/diagnose-modules.js\n` +
          `  • See: docs/guides/E2E_TEST_TROUBLESHOOTING.md`
      );
    }
    console.log('✅ All API modules are healthy\n');

    // CRITICAL: Check if test helper routes (savepoints) are available
    console.log('🔍 Checking savepoint API availability...');
    const savepointResponse = await page.request.get(`${API_BASE_URL}/api/v1/test/status`);
    if (!savepointResponse.ok()) {
      throw new Error(
        `❌ Savepoint API not available (status: ${savepointResponse.status()})\n\n` +
          `🔴 CRITICAL: API server is not running in test mode!\n` +
          `   This will cause:\n` +
          `   • 40+ multi-tenant isolation test failures (SECURITY RISK)\n` +
          `   • No transactional cleanup → data pollution between tests\n` +
          `   • Cascading failures in parallel test runs\n\n` +
          `💡 FIX: API server MUST be started with NODE_ENV=test\n\n` +
          `   Option 1 - Let Playwright auto-start servers (RECOMMENDED):\n` +
          `     npx playwright test\n` +
          `     (webServer config in playwright.config.ts will handle it)\n\n` +
          `   Option 2 - Use the E2E development script:\n` +
          `     npm run e2e:dev\n\n` +
          `   Option 3 - Manually start API in test mode:\n` +
          `     cd apps/api && npm run dev:test\n` +
          `     (Then run: npx playwright test --config playwright.config.ts)\n\n` +
          `🔍 To verify API is in test mode:\n` +
          `   curl http://localhost:4001/api/v1/test/status\n` +
          `   (Should return 200, not 404)`
      );
    } else {
      console.log('✅ Savepoint API available (fast transactional isolation enabled)\n');
    }

    console.log(`📡 Checking if Web server is accessible at ${baseURL}...`);

    // Check if Web is accessible
    const webResponse = await page.request.get(baseURL);
    if (!webResponse.ok()) {
      throw new Error(
        `❌ Web server not accessible at ${baseURL} (status: ${webResponse.status()})`
      );
    }
    console.log('✅ Web server is accessible\n');

    // Create database snapshot template
    // This creates a pristine DB with schema + test user + zero data
    const snapshotManager = new DatabaseSnapshotManager();
    await snapshotManager.createSnapshot();

    console.log('✅ Global setup complete\n');
  } catch (error) {
    console.error('\n❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
