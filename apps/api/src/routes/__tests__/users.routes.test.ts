import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUsersRoutes } from '../users.routes';
import { AuthService } from '../../services/auth.service';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
  return {
    mockDb: {
      prepare: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
    }
  };
});

// Mock the getDbClient utility
vi.mock('../../utils/get-db-client', () => ({
  getDbClient: vi.fn().mockResolvedValue({
    getDatabase: () => mockDb,
  }),
}));

// Mock middlewares
vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (req: any, res: any, next: any) => next(),
  requirePermission: () => (req: any, res: any, next: any) => next(),
  isolateByAccount: (req: any, res: any, next: any) => next(),
  requireAdmin: () => (req: any, res: any, next: any) => next(),
}));

describe('Users Routes', () => {
  let app: express.Application;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    // Mock Auth Middleware
    app.use((req: any, res, next) => {
      // Default to admin user for happy path
      req.user = {
        userId: 'admin-id',
        email: 'admin@example.com',
        accountId: 'acct-1',
        accountType: 'admin',
        permissionLevel: 'admin',
      };
      next();
    });

    authService = {
      hashPassword: vi.fn().mockResolvedValue('hashed_pwd'),
    } as any;

    app.use('/users', createUsersRoutes({} as any, authService));
  });

  describe('GET /users/:id', () => {
    it('should return user profile for admin', async () => {
      const mockUser = { id: 'u1', name: 'Test User', account_id: 'acct-1' };
      
      mockDb.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(mockUser),
      });

      const res = await request(app).get('/users/u1');

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(mockUser);
    });

    it('should return 404 if user not found', async () => {
      mockDb.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      });

      const res = await request(app).get('/users/u999');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update user fields', async () => {
      const mockUser = { id: 'u1', name: 'Old Name', account_id: 'acct-1' };
      
      mockDb.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(mockUser),
        run: vi.fn(),
      });

      const res = await request(app)
        .patch('/users/u1')
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'));
    });
  });

  describe('DELETE /users/:id', () => {
    it('should prevent deleting self', async () => {
      const res = await request(app).delete('/users/admin-id');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot delete your own');
    });

    it('should delete another user', async () => {
        const mockUser = { id: 'u2', account_id: 'acct-1' };
        mockDb.prepare.mockReturnValue({
            get: vi.fn().mockReturnValue(mockUser),
            run: vi.fn(),
        });

        const res = await request(app).delete('/users/u2');
        expect(res.status).toBe(200);
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'));
    });
  });
});
