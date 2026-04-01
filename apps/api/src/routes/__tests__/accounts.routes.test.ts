import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAccountsRoutes } from '../accounts.routes';
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

describe('Accounts Routes', () => {
  let app: express.Application;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = {
        userId: req.header('x-test-user-id') || 'admin-id',
        email: 'admin@example.com',
        accountId: req.header('x-test-account-id') || 'acct-1',
        accountType: req.header('x-test-account-type') || 'admin',
        permissionLevel: req.header('x-test-permission-level') || 'admin',
      };
      next();
    });

    authService = {
      hashPassword: vi.fn(async (password: string) => `hashed_${password}`),
    } as any;

    app.use('/accounts', createAccountsRoutes({} as any, authService));
  });

  it('blocks cross-account user listing for non-admin accounts', async () => {
    const response = await request(app)
      .get('/accounts/acct-2/users')
      .set('x-test-account-type', 'client')
      .set('x-test-account-id', 'acct-1')
      .expect(403);

    expect(response.body.error).toBe('Access denied');
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it('blocks cross-account user creation for non-admin accounts', async () => {
    const response = await request(app)
      .post('/accounts/acct-2/users')
      .set('x-test-account-type', 'client')
      .set('x-test-account-id', 'acct-1')
      .set('x-test-permission-level', 'admin')
      .send({
        email: 'new-user@example.com',
        name: 'New User',
        permission_level: 'senior',
        user_class: 'business',
        password: 'pass1234',
      })
      .expect(403);

    expect(response.body.error).toBe('Access denied');
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it('creates same-account user membership when permission and scope are valid', async () => {
    const insertUserRun = vi.fn();
    const insertMembershipRun = vi.fn();

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE email = ?')) {
        return { get: vi.fn(() => undefined) };
      }
      if (sql.includes('INSERT INTO users')) {
        return { run: insertUserRun };
      }
      if (sql.includes('INSERT INTO user_accounts')) {
        return { run: insertMembershipRun };
      }
      if (sql.includes('SELECT * FROM users WHERE id = ?')) {
        return {
          get: vi.fn(() => ({
            id: 'generated-user',
            email: 'new-user@example.com',
            name: 'New User',
            permission_level: 'senior',
          })),
        };
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
    });

    const response = await request(app)
      .post('/accounts/acct-1/users')
      .set('x-test-account-type', 'client')
      .set('x-test-account-id', 'acct-1')
      .set('x-test-permission-level', 'admin')
      .send({
        email: 'new-user@example.com',
        name: 'New User',
        permission_level: 'senior',
        user_class: 'business',
        password: 'pass1234',
      })
      .expect(200);

    expect(response.body.user).toMatchObject({
      email: 'new-user@example.com',
      name: 'New User',
      permission_level: 'senior',
    });
    expect(insertUserRun).toHaveBeenCalledTimes(1);
    expect(insertMembershipRun).toHaveBeenCalledTimes(1);
    expect((authService.hashPassword as any).mock.calls[0][0]).toBe('pass1234');
  });

  it('returns account-scoped stats for same-account requests', async () => {
    const nodesGet = vi.fn(() => ({ count: 7 }));
    const edgesGet = vi.fn(() => ({ count: 11 }));
    const usersGet = vi.fn(() => ({ count: 3 }));

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM nodes WHERE account_id = ?')) {
        return { get: nodesGet };
      }
      if (sql.includes('FROM edges WHERE account_id = ?')) {
        return { get: edgesGet };
      }
      if (sql.includes('FROM user_accounts WHERE account_id = ?')) {
        return { get: usersGet };
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
    });

    const response = await request(app)
      .get('/accounts/acct-1/stats')
      .set('x-test-account-type', 'client')
      .set('x-test-account-id', 'acct-1')
      .expect(200);

    expect(response.body).toEqual({
      nodes: 7,
      edges: 11,
      users: 3,
    });
    expect(nodesGet).toHaveBeenCalledWith('acct-1');
    expect(edgesGet).toHaveBeenCalledWith('acct-1');
    expect(usersGet).toHaveBeenCalledWith('acct-1', 'active');
  });
});
