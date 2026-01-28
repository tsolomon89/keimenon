import { describe, it, expect, beforeAll } from 'vitest';
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4001';

describe('Boards Integration', () => {
  let token: string;
  const adminEmail = 'admin@admin.com';
  const adminPassword = '123456';

  beforeAll(async () => {
    // 1. Login to get token
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

    if (!res.ok) {
      // If login fails, try registering (in case it's a fresh DB)
      const registerRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
          name: 'Admin Test',
        }),
      });

      if (registerRes.ok) {
        const data = await registerRes.json();
        token = data.token;
        return;
      }
    }

    expect(res.status).toBe(200);
    const data = await res.json();
    token = data.token;
    expect(token).toBeDefined();
  });

  it('should create a new board', async () => {
    const boardData = {
      workspace_id: 'test_workspace',
      name: `Test Board ${Date.now()}`,
      description: 'Test description',
      data_tag: 'test',
    };

    const res = await fetch(`${API_BASE}/api/v1/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(boardData),
    });

    expect(res.status).toBeOneOf([200, 201]);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe(boardData.name);
  });
});
