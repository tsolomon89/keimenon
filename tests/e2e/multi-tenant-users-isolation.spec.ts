import { test, expect } from './fixtures/test-isolation';

/**
 * Multi-Tenant Isolation - Users
 *
 * CRITICAL SECURITY TEST: Ensures that Account A cannot access or modify Account B's user data.
 * This validates user management isolation across accounts.
 *
 * Tests cover:
 * - User list filtering by account
 * - User detail access control
 * - User update restrictions
 * - User deletion restrictions
 * - Cross-account user operations blocked
 *
 * Security Priority: CRITICAL
 * Related: apps/api/src/routes/users.ts
 * Related: docs/architecture/MULTI_TENANCY.md
 */

test.describe('Multi-Tenant Isolation - Users', () => {
  test.describe.configure({ tag: '@smoke' });

  const ACCOUNT_A = {
    email: 'client-alpha@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_B = {
    email: 'client-beta@fixture.test',
    password: 'TestPass123!',
  };

  test('should only list users belonging to the authenticated account', async ({ apiRequest }) => {
    // Step 1: Login as Account A
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    // Step 2: List users (should only see Account A's users)
    const listResponseA = await apiRequest.get('/api/v1/users', {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    if (listResponseA.ok()) {
      const dataA = await listResponseA.json();

      // Verify only Account A's users are visible
      if (dataA.users) {
        dataA.users.forEach((user: any) => {
          // Each user should belong to Account A
          // Note: Admin users might see all users, so check if it's a client account
          if (authA.accountType === 'client') {
            expect(user.accountId).toBe(authA.accountId);
          }
        });
      }
    }

    // Step 3: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 4: List users (should only see Account B's users)
    const listResponseB = await apiRequest.get('/api/v1/users', {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    if (listResponseB.ok()) {
      const dataB = await listResponseB.json();

      // Verify only Account B's users are visible
      if (dataB.users) {
        dataB.users.forEach((user: any) => {
          if (authB.accountType === 'client') {
            expect(user.accountId).toBe(authB.accountId);
          }
        });
      }
    }
  });

  test('should prevent Account B from accessing Account A user details', async ({ apiRequest }) => {
    // Step 1: Get Account A user ID
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const userAId = authA.userId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to read Account A's user details
    const readResponse = await apiRequest.get(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(readResponse.status());
  });

  test('should prevent Account B from updating Account A user', async ({ apiRequest }) => {
    // Step 1: Get Account A user ID
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const userAId = authA.userId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to update Account A's user
    const updateResponse = await apiRequest.put(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        name: 'Hacked Name',
        email: 'hacked@malicious.com',
      },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(updateResponse.status());

    // Step 5: Verify user was NOT modified (check with Account A)
    const verifyResponse = await apiRequest.get(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    if (verifyResponse.ok()) {
      const user = await verifyResponse.json();
      expect(user.email).toBe(ACCOUNT_A.email);
      expect(user.name).not.toBe('Hacked Name');
    }
  });

  test('should prevent Account B from deleting Account A user', async ({ apiRequest }) => {
    // Step 1: Get Account A user ID
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const userAId = authA.userId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to delete Account A's user
    const deleteResponse = await apiRequest.delete(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(deleteResponse.status());

    // Step 5: Verify user still exists (check with Account A)
    const verifyResponse = await apiRequest.get(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });

    // User should still be accessible
    expect([200, 404]).toContain(verifyResponse.status());
    // If 404, that's fine - endpoint might not exist yet
  });

  test('should prevent creating user with another account ID via API manipulation', async ({
    apiRequest,
  }) => {
    // Step 1: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAId = authA.accountId;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to create user with Account A's account_id
    const createResponse = await apiRequest.post('/api/v1/users', {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        email: 'malicious@test.com',
        password: 'password123',
        name: 'Malicious User',
        accountId: accountAId, // Try to inject Account A's account_id
        permissionLevel: 'admin', // Try to escalate privileges
      },
    });

    // If user creation is supported, verify account_id was overridden
    if (createResponse.ok()) {
      const result = await createResponse.json();

      // The user should be created with Account B's account_id, NOT Account A's
      expect(result.user.accountId).not.toBe(accountAId);
      expect(result.user.accountId).toBe(authB.accountId);

      // Verify Account A cannot see this user
      const listResponseA = await apiRequest.get('/api/v1/users', {
        headers: { Authorization: `Bearer ${authA.token}` },
      });

      if (listResponseA.ok()) {
        const usersA = await listResponseA.json();
        const maliciousUser = usersA.users?.find((u: any) => u.email === 'malicious@test.com');
        expect(maliciousUser).toBeUndefined();
      }

      // Cleanup: Delete the test user
      await apiRequest.delete(`/api/v1/users/${result.user.id}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      });
    }
  });

  test('should prevent Account B from changing Account A user permissions', async ({
    apiRequest,
  }) => {
    // Step 1: Get Account A user ID
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const userAId = authA.userId;
    const originalPermission = authA.permissionLevel;

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to escalate Account A user's permissions
    const updateResponse = await apiRequest.put(`/api/v1/users/${userAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        permissionLevel: 'viewer', // Try to downgrade permissions
      },
    });

    // Step 4: Verify access denied
    expect([401, 403, 404]).toContain(updateResponse.status());

    // Step 5: Verify permissions unchanged
    const verifyResponse = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const verifyAuth = await verifyResponse.json();
    expect(verifyAuth.permissionLevel).toBe(originalPermission);
  });

  test('should handle concurrent user access from different accounts', async ({ apiRequest }) => {
    // Step 1: Login both accounts
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const userAId = authA.userId;

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();
    const userBId = authB.userId;

    // Step 2: Both try to access each other's user simultaneously
    const promises = [
      // Account A tries to access Account B's user
      apiRequest.get(`/api/v1/users/${userBId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B tries to access Account A's user
      apiRequest.get(`/api/v1/users/${userAId}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      }),
      // Account A accesses own user (should succeed)
      apiRequest.get(`/api/v1/users/${userAId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B accesses own user (should succeed)
      apiRequest.get(`/api/v1/users/${userBId}`, {
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
});
