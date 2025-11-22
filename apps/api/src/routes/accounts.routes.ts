import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.middleware';
import { randomUUID } from 'crypto';

export function createAccountsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  // CRITICAL FIX: Database client must be obtained per-request for test isolation
  // See: apps/api/src/middleware/db-context.middleware.ts, tests/e2e/fixtures/test-isolation.ts

  /**
   * GET /api/v1/accounts
   * List all accounts (admin only)
   */
  router.get('/', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const accounts = database.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();

      return res.json({ accounts });
    } catch (error: any) {
      console.error('List accounts error:', error);
      return res.status(500).json({ error: error.message || 'Failed to list accounts' });
    }
  });

  /**
   * GET /api/v1/accounts/:id
   * Get account by ID (admin or own account)
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;

      // Check permission: admin or own account
      if (req.user!.accountType !== 'admin' && req.user!.accountId !== id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const account = database.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.json({ account });
    } catch (error: any) {
      console.error('Get account error:', error);
      return res.status(500).json({ error: error.message || 'Failed to get account' });
    }
  });

  /**
   * PATCH /api/v1/accounts/:id
   * Update account (admin only for now)
   */
  router.patch(
    '/:id',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        const { id } = req.params;
        const { account_class, name } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (account_class) {
          updates.push('account_class = ?');
          values.push(account_class);
        }

        if (name) {
          updates.push('name = ?');
          values.push(name);
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        database.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const account = database.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

        return res.json({ account });
      } catch (error: any) {
        console.error('Update account error:', error);
        return res.status(500).json({ error: error.message || 'Failed to update account' });
      }
    }
  );

  /**
   * GET /api/v1/accounts/:id/users
   * List users in account (admin or own account with admin permission)
   */
  router.get('/:id/users', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;

      // Check permission
      if (req.user!.accountType !== 'admin' && req.user!.accountId !== id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get users via user_accounts junction table (M:N relationship)
      const users = database
        .prepare(
          `
          SELECT u.*, ua.permission_level, ua.role_rank, ua.status as membership_status, ua.joined_at
          FROM user_accounts ua
          JOIN users u ON u.id = ua.user_id
          WHERE ua.account_id = ?
          ORDER BY u.created_at DESC
        `
        )
        .all(id);

      return res.json({ users });
    } catch (error: any) {
      console.error('List account users error:', error);
      return res.status(500).json({ error: error.message || 'Failed to list users' });
    }
  });

  /**
   * POST /api/v1/accounts/:id/users
   * Create user in account (admin permission required)
   */
  router.post(
    '/:id/users',
    requireAuth(authService),
    requirePermission('admin'),
    async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        const { id } = req.params;
        const { email, name, permission_level, user_class, password } = req.body;

        // Check permission
        if (req.user!.accountType !== 'admin' && req.user!.accountId !== id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (!email || !name || !permission_level || !user_class) {
          return res
            .status(400)
            .json({ error: 'Email, name, permission_level, and user_class required' });
        }

        // Check if email already exists
        const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
          return res.status(400).json({ error: 'Email already in use' });
        }

        const userId = randomUUID();
        const now = Date.now();

        // Hash password if provided
        let passwordHash = null;
        if (password) {
          passwordHash = await authService.hashPassword(password);
        }

        // Insert user without account_id (M:N model)
        database
          .prepare(
            `INSERT INTO users (
             id,
             email,
             password_hash,
             google_id,
             name,
             permission_level,
             user_class,
             is_active,
             created_at,
             updated_at,
             primary_account_id,
             last_login_account_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            userId,
            email,
            passwordHash,
            null,
            name,
            permission_level,
            user_class,
            1,
            now,
            now,
            id,
            id
          );

        // Create user_accounts membership
        const membershipId = randomUUID();
        const roleRank =
          permission_level === 'admin'
            ? 4
            : permission_level === 'leader'
              ? 3
              : permission_level === 'senior'
                ? 2
                : 1;

        database
          .prepare(
            `INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(membershipId, userId, id, permission_level, roleRank, 'active', now, now, now);

        const user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);

        return res.json({ user });
      } catch (error: any) {
        console.error('Create user error:', error);
        return res.status(500).json({ error: error.message || 'Failed to create user' });
      }
    }
  );

  /**
   * GET /api/v1/accounts/:id/stats
   * Get account statistics (node/edge counts)
   */
  router.get('/:id/stats', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;

      // Check permission
      if (req.user!.accountType !== 'admin' && req.user!.accountId !== id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const nodeCount = database
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?')
        .get(id) as any;

      const edgeCount = database
        .prepare('SELECT COUNT(*) as count FROM edges WHERE account_id = ?')
        .get(id) as any;

      const userCount = database
        .prepare('SELECT COUNT(*) as count FROM user_accounts WHERE account_id = ? AND status = ?')
        .get(id, 'active') as any;

      return res.json({
        nodes: nodeCount.count,
        edges: edgeCount.count,
        users: userCount.count,
      });
    } catch (error: any) {
      console.error('Get account stats error:', error);
      return res.status(500).json({ error: error.message || 'Failed to get stats' });
    }
  });

  return router;
}
