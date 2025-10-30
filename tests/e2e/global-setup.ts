/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests to prepare the test environment.
 * - Creates test user account via registration API
 * - Verifies API and Web servers are accessible
 */

import { chromium, FullConfig } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '123456'; // UPDATED: Correct password in database
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function globalSetup(config: FullConfig) {
  console.log('\n🔧 Running E2E Global Setup...\n');

  const baseURL = config.use?.baseURL || BASE_URL;

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

    console.log(`📡 Checking if Web server is accessible at ${baseURL}...`);

    // Check if Web is accessible
    const webResponse = await page.request.get(baseURL);
    if (!webResponse.ok()) {
      throw new Error(
        `❌ Web server not accessible at ${baseURL} (status: ${webResponse.status()})`
      );
    }
    console.log('✅ Web server is accessible\n');

    console.log(`👤 Checking if test user exists: ${TEST_EMAIL}...`);

    // Try to login with test credentials
    const loginResponse = await page.request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    if (loginResponse.ok()) {
      console.log('✅ Test user already exists\n');
      console.log('✅ Global setup complete\n');
      await browser.close();
      return;
    }

    // User doesn't exist - create via registration
    console.log(`📝 Creating test user: ${TEST_EMAIL}...`);

    const registerResponse = await page.request.post(`${API_BASE_URL}/api/v1/auth/register`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: 'Admin Test User',
        accountType: 'client',
        accountClass: 'business', // Business tier for full feature access
      },
    });

    if (!registerResponse.ok()) {
      const errorText = await registerResponse.text();
      throw new Error(
        `❌ Failed to create test user (status: ${registerResponse.status()}): ${errorText}`
      );
    }

    console.log('✅ Test user created successfully\n');

    // Verify login works
    const verifyLoginResponse = await page.request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    if (!verifyLoginResponse.ok()) {
      throw new Error('❌ Test user created but login failed');
    }

    console.log('✅ Test user login verified\n');
    console.log('✅ Global setup complete\n');
  } catch (error) {
    console.error('\n❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
