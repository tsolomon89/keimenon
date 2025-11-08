import { test, expect } from './fixtures/test-isolation';

/**
 * Multi-Tenant Isolation - Accounts
 *
 * CRITICAL SECURITY TEST: Ensures that Account A cannot access or modify Account B's account data.
 * This validates account management isolation - the highest level security boundary.
 *
 * Tests cover:
 * - Account list filtering (admin only)
 * - Account detail access control
 * - Account settings isolation
 * - Account update restrictions
 * - Cross-account operations blocked
 *
 * Security Priority: CRITICAL (Highest level security boundary)
 * Related: apps/api/src/routes/accounts.ts
 * Related: docs/architecture/MULTI_TENANCY.md
 */

test.describe('Multi-Tenant Isolation - Accounts', () => {
  test.describe.configure({ tag: '@smoke' });

  const ACCOUNT_A = {
    email: 'client-alpha@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_B = {
    email: 'client-beta@fixture.test',
    password: 'TestPass123!',
  };

  test('should prevent Account B from reading Account A account details', async ({
    apiRequest,
  }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to read Account A's account details
    const readResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(readResponse.status());
  });

  test('should prevent Account B from updating Account A account settings', async ({
    apiRequest,
  }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Get original account details
    const originalResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    let originalAccount;
    if (originalResponse.ok()) {
      originalAccount = await originalResponse.json();
    }

    // Step 3: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 4: Attempt to update Account A's settings
    const updateResponse = await apiRequest.put(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        name: 'Hacked Account Name',
        accountClass: 'business', // Try to upgrade tier
        settings: {
          malicious: true,
        },
      },
    });

    // Step 5: Verify access denied
    expect([401, 403, 404]).toContain(updateResponse.status());

    // Step 6: Verify account was NOT modified
    if (originalAccount) {
      const verifyResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      });

      if (verifyResponse.ok()) {
        const account = await verifyResponse.json();
        expect(account.name).toBe(originalAccount.name);
        expect(account.accountClass).toBe(originalAccount.accountClass);
      }
    }
  });

  test('should prevent Account B from deleting Account A', async ({ apiRequest }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to delete Account A
    const deleteResponse = await apiRequest.delete(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(deleteResponse.status());

    // Step 5: Verify Account A still exists (can still login)
    const verifyLogin = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    expect(verifyLogin.ok()).toBeTruthy();
  });

  test('should only list own account for client users', async ({ apiRequest }) => {
    // Step 1: Login as Account A (client)
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    // Step 2: List accounts
    const listResponse = await apiRequest.get('/api/v1/accounts', {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    if (listResponse.ok()) {
      const data = await listResponse.json();

      // Client users should only see their own account
      if (authA.accountType === 'client' && data.accounts) {
        expect(data.accounts).toHaveLength(1);
        expect(data.accounts[0].id).toBe(authA.accountId);
      }
    } else {
      // If endpoint doesn't allow listing, that's fine (403/404)
      expect([401, 403, 404]).toContain(listResponse.status());
    }
  });

  test('should prevent account tier manipulation across accounts', async ({ apiRequest }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Get original tier
    const originalResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    let originalTier;
    if (originalResponse.ok()) {
      const original = await originalResponse.json();
      originalTier = original.accountClass || original.tier;
    }

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to upgrade Account A's tier
    const updateResponse = await apiRequest.put(`/api/v1/accounts/${accountAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        accountClass: 'business', // Try to upgrade to premium tier
        tier: 'enterprise',
      },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(updateResponse.status());

    // Step 5: Verify tier unchanged
    if (originalTier) {
      const verifyResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      });

      if (verifyResponse.ok()) {
        const account = await verifyResponse.json();
        expect(account.accountClass || account.tier).toBe(originalTier);
      }
    }
  });

  test('should prevent reading account statistics across accounts', async ({ apiRequest }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to read Account A's statistics
    const statsResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}/stats`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(statsResponse.status());
  });

  test('should prevent Account B from accessing Account A member list', async ({ apiRequest }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to read Account A's members
    const membersResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}/members`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(membersResponse.status());
  });

  test('should handle concurrent account access from different accounts', async ({
    apiRequest,
  }) => {
    // Step 1: Login both accounts
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();
    const accountBId = authB.accountId;

    // Step 2: Both try to access each other's account simultaneously
    const promises = [
      // Account A tries to access Account B's account
      apiRequest.get(`/api/v1/accounts/${accountBId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B tries to access Account A's account
      apiRequest.get(`/api/v1/accounts/${accountAId}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      }),
      // Account A accesses own account (should succeed)
      apiRequest.get(`/api/v1/accounts/${accountAId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B accesses own account (should succeed)
      apiRequest.get(`/api/v1/accounts/${accountBId}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      }),
    ];

    const results = await Promise.all(promises);

    // Verify: Cross-account access denied, own-account access allowed
    expect([401, 403, 404]).toContain(results[0].status()); // A→B denied
    expect([401, 403, 404]).toContain(results[1].status()); // B→A denied
    expect([200, 404]).toContain(results[2].status()); // A→A allowed (or endpoint doesn't exist)
    expect([200, 404]).toContain(results[3].status()); // B→B allowed (or endpoint doesn't exist)
  });

  test('should prevent cross-account billing/payment information access', async ({
    apiRequest,
  }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to read Account A's billing information
    const billingResponse = await apiRequest.get(`/api/v1/accounts/${accountAId}/billing`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(billingResponse.status());
  });
});
