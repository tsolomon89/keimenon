import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWorkspaceRoutes } from '../workspace.routes';
import { AuthService } from '../../services/auth.service';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    prepare: vi.fn(),
  },
}));

vi.mock('../../utils/get-db-client', () => ({
  getDbClient: vi.fn().mockResolvedValue({
    getDatabase: () => mockDb,
  }),
}));

vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

describe('Workspace Routes Overlaps', () => {
  let app: express.Application;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = {
        userId: 'user-1',
        email: 'alice@example.com',
        accountId: 'acct-1',
        accountType: 'client',
        permissionLevel: 'admin',
      };
      next();
    });

    authService = {} as any;
    app.use('/workspaces', createWorkspaceRoutes({} as any, authService));
  });

  it('correctly calculates overlap count and resolves creator name', async () => {
    const mockAllRows = [
      {
        id: 'w-1',
        properties: JSON.stringify({
          title: 'Workspace 1',
          source_role: 'workspace',
          context_pins: ['node-1', 'node-2'],
        }),
        created_by: 'user-1',
        creator_name: 'Alice',
        creator_email: 'alice@example.com',
      },
      {
        id: 'w-2',
        properties: JSON.stringify({
          title: 'Workspace 2',
          source_role: 'workspace',
          context_pins: ['node-2', 'node-3'],
        }),
        created_by: 'user-2',
        creator_name: 'Bob',
        creator_email: 'bob@example.com',
      },
      {
        id: 'w-3',
        properties: JSON.stringify({
          title: 'Workspace 3',
          source_role: 'workspace',
          context_pins: ['node-4'],
        }),
        created_by: 'user-3',
        creator_name: 'Charlie',
        creator_email: 'charlie@example.com',
      },
    ];

    mockDb.prepare.mockImplementation((sql: string) => {
      // First query (all workspaces for overlaps)
      if (sql.includes('SELECT n.id, n.properties, n.created_by, u.name AS creator_name')) {
        return {
          all: vi.fn(() => mockAllRows),
        };
      }
      // Second query (paginated workspaces)
      if (sql.includes('SELECT n.*, u.name AS creator_name, u.email AS creator_email')) {
        return {
          all: vi.fn(() => [
            {
              id: 'w-1',
              kind: 'Source',
              properties: JSON.stringify({
                title: 'Workspace 1',
                source_role: 'workspace',
                context_pins: ['node-1', 'node-2'],
              }),
              created_by: 'user-1',
              creator_name: 'Alice',
              creator_email: 'alice@example.com',
              created_at: 1000,
              updated_at: 1000,
            },
            {
              id: 'w-2',
              kind: 'Source',
              properties: JSON.stringify({
                title: 'Workspace 2',
                source_role: 'workspace',
                context_pins: ['node-2', 'node-3'],
              }),
              created_by: 'user-2',
              creator_name: 'Bob',
              creator_email: 'bob@example.com',
              created_at: 900,
              updated_at: 900,
            },
            {
              id: 'w-3',
              kind: 'Source',
              properties: JSON.stringify({
                title: 'Workspace 3',
                source_role: 'workspace',
                context_pins: ['node-4'],
              }),
              created_by: 'user-3',
              creator_name: 'Charlie',
              creator_email: 'charlie@example.com',
              created_at: 800,
              updated_at: 800,
            },
          ]),
        };
      }
      // Count query
      if (sql.includes('SELECT COUNT(*) as count FROM nodes')) {
        return {
          get: vi.fn(() => ({ count: 3 })),
        };
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
    });

    const response = await request(app).get('/workspaces').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.workspaces).toHaveLength(3);

    // Assert Workspace 1 (W1)
    const w1 = response.body.workspaces.find((w: any) => w.id === 'w-1');
    expect(w1).toBeDefined();
    expect(w1.creator_name).toBe('Alice');
    expect(w1.overlaps).toHaveLength(1);
    expect(w1.overlaps[0]).toEqual({
      id: 'w-2',
      title: 'Workspace 2',
      creator_name: 'Bob',
      shared_count: 1, // 'node-2' is shared
    });

    // Assert Workspace 2 (W2)
    const w2 = response.body.workspaces.find((w: any) => w.id === 'w-2');
    expect(w2).toBeDefined();
    expect(w2.creator_name).toBe('Bob');
    expect(w2.overlaps).toHaveLength(1);
    expect(w2.overlaps[0]).toEqual({
      id: 'w-1',
      title: 'Workspace 1',
      creator_name: 'Alice',
      shared_count: 1,
    });

    // Assert Workspace 3 (W3)
    const w3 = response.body.workspaces.find((w: any) => w.id === 'w-3');
    expect(w3).toBeDefined();
    expect(w3.creator_name).toBe('Charlie');
    expect(w3.overlaps).toHaveLength(0); // disjoint
  });
});
