import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:4001';

// Helper for requests
async function request(
  method: string,
  path: string,
  data: any = null,
  token: string | null = null
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

describe('Authentication & Authorization Suite', () => {
  // Test Data State
  const testData = {
    admin: null as any,
    client1: null as any,
    client2: null as any,
  };

  const timestamp = Date.now();

  beforeAll(async () => {
    // Check Health
    try {
      const res = await request('GET', '/health');
      if (res.status !== 200) {
        console.warn('⚠️ API Server is not running at ' + API_BASE);
        // We might want to skip or fail here, but let's let individual tests fail
      }
    } catch (e) {
      console.warn('⚠️ API Server is not reachable');
    }
  });

  describe('Setup Test Data', () => {
    it('should create or login admin account', async () => {
      const account = {
        email: 'admin-test@test.com',
        password: 'Admin123!',
        name: 'Admin Test',
        accountType: 'admin',
        accountClass: 'business',
      };

      let res = await request('POST', '/api/v1/auth/register', account);
      if (res.status === 409) {
        res = await request('POST', '/api/v1/auth/login', {
          email: account.email,
          password: account.password,
        });
      }
      expect([200, 201]).toContain(res.status);
      testData.admin = res.body;
      expect(testData.admin.token).toBeDefined();
    });

    it('should create or login client 1', async () => {
      const account = {
        email: 'client1@test.com',
        password: 'Client123!',
        name: 'Client 1',
        accountType: 'client',
        accountClass: 'professional',
      };

      let res = await request('POST', '/api/v1/auth/register', account);
      if (res.status === 409) {
        res = await request('POST', '/api/v1/auth/login', {
          email: account.email,
          password: account.password,
        });
      }
      expect([200, 201]).toContain(res.status);
      testData.client1 = res.body;
      expect(testData.client1.token).toBeDefined();
    });

    it('should create or login client 2', async () => {
      const account = {
        email: 'client2@test.com',
        password: 'Client123!',
        name: 'Client 2',
        accountType: 'client',
        accountClass: 'free',
      };

      let res = await request('POST', '/api/v1/auth/register', account);
      if (res.status === 409) {
        res = await request('POST', '/api/v1/auth/login', {
          email: account.email,
          password: account.password,
        });
      }
      expect([200, 201]).toContain(res.status);
      testData.client2 = res.body;
      expect(testData.client2.token).toBeDefined();
    });
  });

  describe('Auth Flow', () => {
    it('should register a new user', async () => {
      const res = await request('POST', '/api/v1/auth/register', {
        email: `test-${Date.now()}@test.com`,
        password: 'Test123!',
        name: 'Test User',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.body.token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const res = await request('POST', '/api/v1/auth/login', {
        email: 'invalid@test.com',
        password: 'wrong',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    let nodeId: string;

    it('Client 1 should create a node', async () => {
      const res = await request(
        'POST',
        '/api/v1/nodes/group',
        {
          id: `grp_test_${Date.now()}`,
          kind: 'Group',
          name: 'Client 1 Private Group',
          purpose: 'Testing isolation',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        testData.client1.token
      );

      expect([200, 201]).toContain(res.status);
      nodeId = res.body.id || res.body.node?.id;
      expect(nodeId).toBeDefined();
    });

    it('Client 1 should see their node', async () => {
      const res = await request('GET', `/api/v1/nodes/${nodeId}`, null, testData.client1.token);
      expect(res.status).toBe(200);
    });

    it('Client 2 should NOT see Client 1 node', async () => {
      const res = await request('GET', `/api/v1/nodes/${nodeId}`, null, testData.client2.token);
      expect([403, 404]).toContain(res.status);
    });

    it('Admin should see Client 1 node', async () => {
      const res = await request('GET', `/api/v1/nodes/${nodeId}`, null, testData.admin.token);
      expect(res.status).toBe(200);
    });
  });

  describe('Edge Ownership', () => {
    // Logic from testEdgeOwnership
    it('Client 1 cannot link to Client 2 node', async () => {
      // Create Client 1 node
      const n1 = await request(
        'POST',
        '/api/v1/nodes/group',
        {
          id: `grp_c1_${Date.now()}`,
          kind: 'Group',
          name: 'C1 Node',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        testData.client1.token
      );

      // Create Client 2 node
      const n2 = await request(
        'POST',
        '/api/v1/nodes/group',
        {
          id: `grp_c2_${Date.now()}`,
          kind: 'Group',
          name: 'C2 Node',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        testData.client2.token
      );

      const id1 = n1.body.id || n1.body.node?.id;
      const id2 = n2.body.id || n2.body.node?.id;

      // Try to link C1 -> C2 using C1 token
      const edge = await request(
        'POST',
        '/api/v1/edges',
        {
          from_id: id1,
          to_id: id2,
          kind: 'CONTAINS',
        },
        testData.client1.token
      );

      expect([403, 404]).toContain(edge.status);
    });
  });
});
