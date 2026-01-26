import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.middleware';

export function createUsersRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/users/:id
   * Get user by ID (admin, or same account with leader+ permission, or self)
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;

      const user = database.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check permission
      const isAdmin = req.user!.accountType === 'admin';
      const isSelf = req.user!.userId === id;
      const isSameAccount = req.user!.accountId === user.account_id;
      const hasPermission = ['leader', 'admin'].includes(req.user!.permissionLevel);

      if (!isAdmin && !isSelf && !(isSameAccount && hasPermission)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.json({ user });
    } catch (error: any) {
      console.error('Get user error:', error);
      return res.status(500).json({ error: error.message || 'Failed to get user' });
    }
  });

  /**
   * PATCH /api/v1/users/:id
   * Update user (admin, or same account admin permission, or self for limited fields)
   */
  router.patch('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;
      const { name, permission_level, is_active, password } = req.body;

      const user = database.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check permission
      const isAdmin = req.user!.accountType === 'admin';
      const isSelf = req.user!.userId === id;
      const isSameAccount = req.user!.accountId === user.account_id;
      const hasAdminPermission = req.user!.permissionLevel === 'admin';

      const canEditAll = isAdmin || (isSameAccount && hasAdminPermission);
      const canEditSelf = isSelf;

      if (!canEditAll && !canEditSelf) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updates: string[] = [];
      const values: any[] = [];

      // Self can only edit name and password
      if (canEditSelf && !canEditAll) {
        if (name) {
          updates.push('name = ?');
          values.push(name);
        }
        if (password) {
          const passwordHash = await authService.hashPassword(password);
          updates.push('password_hash = ?');
          values.push(passwordHash);
        }
      } else {
        // Admin can edit all fields
        if (name) {
          updates.push('name = ?');
          values.push(name);
        }
        if (permission_level) {
          updates.push('permission_level = ?');
          values.push(permission_level);
        }
        if (typeof is_active === 'boolean') {
          updates.push('is_active = ?');
          values.push(is_active ? 1 : 0);
        }
        if (password) {
          const passwordHash = await authService.hashPassword(password);
          updates.push('password_hash = ?');
          values.push(passwordHash);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      database.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      const updatedUser = database.prepare('SELECT * FROM users WHERE id = ?').get(id);

      return res.json({ user: updatedUser });
    } catch (error: any) {
      console.error('Update user error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update user' });
    }
  });

  /**
   * DELETE /api/v1/users/:id
   * Delete user (admin permission required, cannot delete self)
   */
  router.delete(
    '/:id',
    requireAuth(authService),
    requirePermission('admin'),
    async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        const { id } = req.params;

        if (req.user!.userId === id) {
          return res.status(400).json({ error: 'Cannot delete your own user account' });
        }

        const user = database.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Check permission
        const isAdmin = req.user!.accountType === 'admin';
        const isSameAccount = req.user!.accountId === user.account_id;

        if (!isAdmin && !isSameAccount) {
          return res.status(403).json({ error: 'Access denied' });
        }

        database.prepare('DELETE FROM users WHERE id = ?').run(id);

        return res.json({ message: 'User deleted successfully' });
      } catch (error: any) {
        console.error('Delete user error:', error);
        return res.status(500).json({ error: error.message || 'Failed to delete user' });
      }
    }
  );

  return router;
}
