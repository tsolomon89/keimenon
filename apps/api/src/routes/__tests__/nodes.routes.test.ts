import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createNodesRoutes } from '../nodes';
import { AuthService } from '../../services/auth.service';

// Mock dependencies - hoisted vars must be defined properly or inlined
const { mockDbClient, mockDb } = vi.hoisted(() => {
  const db = {
    createNode: vi.fn(),
    getNode: vi.fn(),
    updateNode: vi.fn(),
    deleteNode: vi.fn(),
    execute: vi.fn(),
  };
  return {
    mockDb: db,
    mockDbClient: {
      getDatabase: vi.fn().mockReturnValue(db),
      createNode: db.createNode,
      getNode: db.getNode,
      updateNode: db.updateNode,
      deleteNode: db.deleteNode,
      execute: db.execute,
    }
  };
});

// Mock the getDbClient utility
vi.mock('../../utils/get-db-client', () => ({
  getDbClient: vi.fn().mockResolvedValue(mockDbClient),
}));

// Mock middlewares
vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (req: any, res: any, next: any) => next(),
  requirePermission: () => (req: any, res: any, next: any) => next(),
  isolateByAccount: (req: any, res: any, next: any) => next(),
  requireAdmin: () => (req: any, res: any, next: any) => next(),
}));

describe('Nodes Routes', () => {
  let app: express.Application;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    // Mock User Context
    app.use((req: any, res, next) => {
      req.user = {
        userId: 'admin-id',
        email: 'admin@example.com',
        accountId: 'acct-1',
        accountType: 'admin',
        permissionLevel: 'admin',
      };
      next();
    });

    authService = {} as any; // Not used due to mocked middleware

    app.use('/nodes', createNodesRoutes(authService));
  });

  describe('POST /nodes/source', () => {
    it('should create a source node', async () => {
      mockDb.createNode.mockResolvedValue(undefined);

      const payload = {
        id: 'new-node-1',
        kind: 'Source',
        created_at: 1234567890,
        updated_at: 1234567890,
        metadata: { title: 'Test Source' },
        fingerprint: 'abc123hash',
        mime_type: 'text/plain',
        size_bytes: 100,
        url: 'http://example.com',
      };

      const res = await request(app)
        .post('/nodes/source')
        .send(payload);

      if (res.status !== 201) {
        console.error('Create Source Error:', JSON.stringify(res.body, null, 2));
      }

      expect(res.status).toBe(201);
      expect(mockDb.createNode).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'Source',
        account_id: 'acct-1',
      }));
    });
  });

  describe('GET /nodes/:id', () => {
    it('should return a node', async () => {
      const mockNode = { id: 'n1', kind: 'Source', account_id: 'acct-1' };
      mockDb.getNode.mockResolvedValue(mockNode);

      const res = await request(app).get('/nodes/n1');

      expect(res.status).toBe(200);
      expect(res.body.node).toEqual(mockNode);
    });

    it('should return 404 if not found', async () => {
      mockDb.getNode.mockResolvedValue(null);
      const res = await request(app).get('/nodes/n999');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /nodes/:id', () => {
    it('should delete a node', async () => {
      const mockNode = { id: 'n1', account_id: 'acct-1' };
      mockDb.getNode.mockResolvedValue(mockNode);
      mockDb.deleteNode.mockResolvedValue(undefined);

      const res = await request(app).delete('/nodes/n1');

      expect(res.status).toBe(200);
      expect(mockDb.deleteNode).toHaveBeenCalledWith('n1');
    });
  });
});
