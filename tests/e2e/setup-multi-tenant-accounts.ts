/**
 * Setup Script for Multi-Tenant Test Accounts
 *
 * Creates test accounts needed for multi-tenant isolation tests:
 * - client-a@test.com (Account A)
 * - client-b@test.com (Account B)
 *
 * Run this before running multi-tenant isolation tests:
 * npx tsx tests/e2e/setup-multi-tenant-accounts.ts
 */

import { request } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';

interface TestAccount {
  email: string;
  password: string;
  accountName: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    email: 'client-alpha@test.com',
    password: 'SecurePass-2024-Alpha', // Strong password with JSON-safe special char
    accountName: 'Test Account Alpha',
  },
  {
    email: 'client-beta@test.com',
    password: 'SecurePass_2024_Beta', // Strong password with JSON-safe special char
    accountName: 'Test Account Beta',
  },
];

async function setupAccount(account: TestAccount): Promise<void> {
  const context = await request.newContext({
    baseURL: API_BASE_URL,
  });

  try {
    console.log(`\n📝 Setting up ${account.email}...`);

    // Try to login first to check if account exists
    const loginResponse = await context.post('/api/v1/auth/login', {
      data: {
        email: account.email,
        password: account.password,
      },
    });

    if (loginResponse.ok()) {
      console.log(`✅ ${account.email} already exists and can login`);
      await context.dispose();
      return;
    }

    // Account doesn't exist, create it
    console.log(`🔧 Creating new account for ${account.email}...`);

    const registerResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: account.email,
        password: account.password,
        confirmPassword: account.password,
        name: account.accountName,
      },
    });

    if (registerResponse.ok()) {
      console.log(`✅ Successfully created ${account.email}`);

      // Verify login works
      const verifyLogin = await context.post('/api/v1/auth/login', {
        data: {
          email: account.email,
          password: account.password,
        },
      });

      if (verifyLogin.ok()) {
        const auth = await verifyLogin.json();
        console.log(`✅ Login verified for ${account.email}`);
        console.log(`   Account ID: ${auth.account_id || auth.selected_account_id || 'N/A'}`);
      } else {
        console.warn(`⚠️  Created ${account.email} but login failed`);
      }
    } else {
      const errorText = await registerResponse.text();
      console.error(`❌ Failed to create ${account.email}`);
      console.error(`   Status: ${registerResponse.status()}`);
      console.error(`   Response: ${errorText.substring(0, 200)}`);

      // If it's a validation error, the account might already exist
      if (errorText.includes('already exists') || errorText.includes('already registered')) {
        console.log(`ℹ️  ${account.email} appears to already exist`);
      }
    }
  } catch (error) {
    console.error(`❌ Error setting up ${account.email}:`, error);
  } finally {
    await context.dispose();
  }
}

async function main() {
  console.log('🚀 Multi-Tenant Test Account Setup');
  console.log('==================================\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // Check if API is accessible by testing login endpoint
  try {
    const context = await request.newContext({ baseURL: API_BASE_URL });
    const testCheck = await context
      .post('/api/v1/auth/login', {
        data: { email: 'nonexistent@test.com', password: 'test' },
      })
      .catch(() => null);

    if (!testCheck) {
      console.error('❌ API server is not accessible at', API_BASE_URL);
      console.error('   Please ensure the API server is running:');
      console.error('   npm run dev:api\n');
      process.exit(1);
    }

    console.log('✅ API server is accessible\n');
    await context.dispose();
  } catch (error) {
    console.error('❌ Failed to connect to API server:', error);
    process.exit(1);
  }

  // Setup each test account
  for (const account of TEST_ACCOUNTS) {
    await setupAccount(account);
  }

  console.log('\n==================================');
  console.log('✅ Setup complete!\n');
  console.log('You can now run multi-tenant isolation tests:');
  console.log('npx playwright test tests/e2e/multi-tenant-*.spec.ts\n');
}

main().catch(console.error);
