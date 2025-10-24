import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { randomUUID } from 'crypto';

export function createAdminRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  const database = db.getDatabase();

  /**
   * POST /api/v1/admin/accounts
   * Create a new client account with initial admin user (admin only)
   */
  router.post(
    '/accounts',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { accountName, accountEmail, accountClass, userName, userEmail, userPassword } =
          req.body;

        // Validation
        if (
          !accountName ||
          !accountEmail ||
          !accountClass ||
          !userName ||
          !userEmail ||
          !userPassword
        ) {
          return res.status(400).json({
            error:
              'Missing required fields: accountName, accountEmail, accountClass, userName, userEmail, userPassword',
          });
        }

        // Check if account email already exists
        const existingAccount = database
          .prepare('SELECT id FROM accounts WHERE email = ?')
          .get(accountEmail) as any;

        if (existingAccount) {
          return res.status(409).json({ error: 'Account with this email already exists' });
        }

        // Check if user email already exists
        const existingUser = database
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(userEmail) as any;

        if (existingUser) {
          return res.status(409).json({ error: 'User with this email already exists' });
        }

        // Hash password
        const passwordHash = await authService.hashPassword(userPassword);

        const now = Date.now();
        const accountId = randomUUID();
        const userId = randomUUID();

        // Create account and user in transaction
        const transaction = database.transaction(() => {
          // 1. Create account
          database
            .prepare(
              `INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(accountId, 'client', accountClass, accountEmail, accountName, now, now);

          // 2. Create initial admin user (M:N model)
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
              userEmail,
              passwordHash,
              null,
              userName,
              'admin',
              'person',
              1,
              now,
              now,
              accountId,
              accountId
            );

          // 2.5 Create user_accounts membership
          const membershipId = randomUUID();
          database
            .prepare(
              `INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(membershipId, userId, accountId, 'admin', 4, 'active', now, now, now);

          // 3. Link account to admin account via account_links
          const linkId = randomUUID();
          database
            .prepare(
              `INSERT INTO account_links (id, admin_account_id, client_account_id, linked_at, linked_by, notes)
             VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
              linkId,
              req.user!.accountId, // Current admin's account
              accountId, // New client account
              now,
              req.user!.userId,
              'Created via admin CRM'
            );
        });

        transaction();

        // Get created account and user
        const account = database.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
        const user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);

        return res.status(201).json({
          success: true,
          account,
          user,
        });
      } catch (error: any) {
        console.error('Admin create account error:', error);
        return res.status(500).json({ error: error.message || 'Failed to create account' });
      }
    }
  );

  return router;
}
