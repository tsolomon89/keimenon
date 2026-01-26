import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import Database from 'better-sqlite3';

/**
 * Calculate estimated MRR based on account tiers
 * Note: This is a placeholder until proper subscription tracking is implemented
 */
function calculateEstimatedMRR(database: Database.Database): number {
  const accountsByTier = database
    .prepare(
      `
    SELECT
      account_class,
      COUNT(*) as count
    FROM accounts
    WHERE account_type = 'client'
    GROUP BY account_class
  `
    )
    .all() as any[];

  // Estimated pricing (replace with actual when subscriptions table exists)
  const pricing: Record<string, number> = {
    free: 0,
    professional: 29,
    business: 99,
  };

  let mrr = 0;
  accountsByTier.forEach((tier) => {
    const price = pricing[tier.account_class] || 0;
    mrr += price * tier.count;
  });

  return mrr;
}

export function createAnalyticsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  // CRITICAL FIX: Database client must be obtained per-request for test isolation
  // See: apps/api/src/middleware/db-context.middleware.ts, tests/e2e/fixtures/test-isolation.ts

  /**
   * GET /api/v1/analytics/overview
   * Get analytics overview
   * - Admin users (no operating context): system-wide view
   * - Admin users (in CRM mode): account-scoped view for target account
   * - Client users: account-scoped view for their own account
   */
  router.get('/overview', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // Determine target account and scope
      const isAdmin = req.user?.accountType === 'admin';
      const targetAccountId = req.operating?.accountId || req.user?.accountId;
      const isSystemWideView = isAdmin && !req.operating;

      // Account Metrics
      let accountStats: any;
      let totalSeats: any;

      if (isSystemWideView) {
        // Admin system-wide view: all accounts
        accountStats = database
          .prepare(
            `
          SELECT
            COUNT(*) as total_accounts,
            SUM(CASE WHEN account_type = 'client' THEN 1 ELSE 0 END) as client_accounts,
            SUM(CASE WHEN account_class = 'free' THEN 1 ELSE 0 END) as free_tier,
            SUM(CASE WHEN account_class = 'professional' THEN 1 ELSE 0 END) as pro_tier,
            SUM(CASE WHEN account_class = 'business' THEN 1 ELSE 0 END) as business_tier
          FROM accounts
        `
          )
          .get() as any;

        totalSeats = database
          .prepare(
            `
          SELECT COUNT(*) as count FROM users WHERE is_active = 1
        `
          )
          .get() as any;
      } else {
        // Account-scoped view: single account stats
        accountStats = database
          .prepare(
            `
          SELECT
            1 as total_accounts,
            CASE WHEN account_type = 'client' THEN 1 ELSE 0 END as client_accounts,
            CASE WHEN account_class = 'free' THEN 1 ELSE 0 END as free_tier,
            CASE WHEN account_class = 'professional' THEN 1 ELSE 0 END as pro_tier,
            CASE WHEN account_class = 'business' THEN 1 ELSE 0 END as business_tier
          FROM accounts
          WHERE id = ?
        `
          )
          .get(targetAccountId) as any;

        totalSeats = database
          .prepare(
            `
          SELECT COUNT(*) as count
          FROM user_accounts ua
          JOIN users u ON u.id = ua.user_id
          WHERE ua.account_id = ? AND ua.status = 'active' AND u.is_active = 1
        `
          )
          .get(targetAccountId) as any;
      }

      // User Activity (last 7 and 30 days)
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      let activeUsers7d: any = { count: 0 };
      let activeUsers30d: any = { count: 0 };
      let sessionTimeResult: any = { avg_minutes: 0 };

      // Try to fetch activity from audit_log, fallback to zeros if table doesn't exist
      try {
        if (isSystemWideView) {
          // System-wide activity
          activeUsers7d = database
            .prepare(
              `
            SELECT COUNT(DISTINCT actor_user_id) as count
            FROM audit_log
            WHERE timestamp > ?
          `
            )
            .get(sevenDaysAgo) as any;

          activeUsers30d = database
            .prepare(
              `
            SELECT COUNT(DISTINCT actor_user_id) as count
            FROM audit_log
            WHERE timestamp > ?
          `
            )
            .get(thirtyDaysAgo) as any;

          sessionTimeResult = database
            .prepare(
              `
            SELECT AVG(session_duration) as avg_minutes
            FROM (
              SELECT
                actor_user_id,
                DATE(timestamp/1000, 'unixepoch') as session_date,
                (MAX(timestamp) - MIN(timestamp)) / 60000.0 as session_duration
              FROM audit_log
              WHERE timestamp > ? AND success = 1
              GROUP BY actor_user_id, session_date
              HAVING COUNT(*) > 1
            )
          `
            )
            .get(thirtyDaysAgo) as any;
        } else {
          // Account-scoped activity
          activeUsers7d = database
            .prepare(
              `
            SELECT COUNT(DISTINCT actor_user_id) as count
            FROM audit_log
            WHERE timestamp > ? AND actor_account_id = ?
          `
            )
            .get(sevenDaysAgo, targetAccountId) as any;

          activeUsers30d = database
            .prepare(
              `
            SELECT COUNT(DISTINCT actor_user_id) as count
            FROM audit_log
            WHERE timestamp > ? AND actor_account_id = ?
          `
            )
            .get(thirtyDaysAgo, targetAccountId) as any;

          sessionTimeResult = database
            .prepare(
              `
            SELECT AVG(session_duration) as avg_minutes
            FROM (
              SELECT
                actor_user_id,
                DATE(timestamp/1000, 'unixepoch') as session_date,
                (MAX(timestamp) - MIN(timestamp)) / 60000.0 as session_duration
              FROM audit_log
              WHERE timestamp > ? AND actor_account_id = ? AND success = 1
              GROUP BY actor_user_id, session_date
              HAVING COUNT(*) > 1
            )
          `
            )
            .get(thirtyDaysAgo, targetAccountId) as any;
        }
      } catch (auditError) {
        // audit_log table doesn't exist or is empty - use default zeros
        console.warn('Analytics: audit_log queries failed, using fallback values:', auditError);
      }

      const avgSessionTime = sessionTimeResult?.avg_minutes || 0;

      // Storage & Resources
      let storageStats: any;
      let storageSizeResult: any;

      if (isSystemWideView) {
        // System-wide storage
        storageStats = database
          .prepare(
            `
          SELECT
            (SELECT COUNT(*) FROM nodes) as total_nodes,
            (SELECT COUNT(*) FROM edges) as total_edges,
            (SELECT COUNT(*) FROM nodes WHERE kind = 'Source') as total_sources
        `
          )
          .get() as any;

        storageSizeResult = database
          .prepare(
            `
          SELECT SUM(LENGTH(properties)) as total_bytes
          FROM nodes
        `
          )
          .get() as any;
      } else {
        // Account-scoped storage
        storageStats = database
          .prepare(
            `
          SELECT
            (SELECT COUNT(*) FROM nodes WHERE account_id = ?) as total_nodes,
            (SELECT COUNT(*) FROM edges WHERE account_id = ?) as total_edges,
            (SELECT COUNT(*) FROM nodes WHERE account_id = ? AND kind = 'Source') as total_sources
        `
          )
          .get(targetAccountId, targetAccountId, targetAccountId) as any;

        storageSizeResult = database
          .prepare(
            `
          SELECT SUM(LENGTH(properties)) as total_bytes
          FROM nodes
          WHERE account_id = ?
        `
          )
          .get(targetAccountId) as any;
      }

      const storageSize = storageSizeResult?.total_bytes || 0;

      // Processing Jobs (mock for now - would need jobs table)
      const processingStats = {
        active: 0,
        completed_today: 0,
        failed: 0,
      };

      // System Health (mock for now - would need monitoring table)
      const systemHealth = {
        api_latency_ms: 0,
        error_rate: 0,
        uptime_percent: 100,
      };

      return res.json({
        accounts: {
          active: accountStats.total_accounts,
          total_seats: totalSeats.count,
          tier_distribution: {
            free: accountStats.free_tier,
            professional: accountStats.pro_tier,
            business: accountStats.business_tier,
          },
        },
        user_activity: {
          last_7_days: activeUsers7d.count,
          last_30_days: activeUsers30d.count,
          avg_session_time_minutes: Math.round(avgSessionTime * 100) / 100, // Round to 2 decimals
        },
        storage: {
          total_nodes: storageStats.total_nodes,
          total_edges: storageStats.total_edges,
          total_sources: storageStats.total_sources,
          storage_size_bytes: storageSize,
        },
        processing: processingStats,
        billing: {
          // TODO: Implement billing metrics using subscriptions table
          // Related: packages/db/src/sqlite/schema.sql (add subscriptions table)
          // See: docs/architecture/BILLING.md (needs creation)
          // For now, calculate estimated value based on account classes
          mrr: calculateEstimatedMRR(database),
          churn_rate: 0, // Requires subscription history
          customer_ltv: 0, // Requires subscription history
        },
        system_health: systemHealth,
      });
    } catch (error: any) {
      console.error('Analytics overview error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
    }
  });

  /**
   * GET /api/v1/analytics/top-accounts
   * Get top accounts by various metrics
   * - Admin only (system-wide view of all client accounts)
   * - Client users: returns empty array (not applicable)
   */
  router.get('/top-accounts', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const isAdmin = req.user?.accountType === 'admin';

      // Only admin users can view top accounts (system-wide metric)
      if (!isAdmin) {
        return res.json({ accounts: [] }); // Empty for client users
      }

      const { metric = 'usage', limit = 10 } = req.query;

      let query = '';
      if (metric === 'usage') {
        // Top by activity
        // SECURITY FIX: Filter audit_log by account_id to prevent cross-account activity exposure
        query = `
          SELECT
            a.id, a.name, a.account_class,
            COUNT(DISTINCT al.id) as activity_count
          FROM accounts a
          LEFT JOIN user_accounts ua ON ua.account_id = a.id
          LEFT JOIN users u ON u.id = ua.user_id
          LEFT JOIN audit_log al ON al.actor_user_id = u.id AND al.actor_account_id = a.id
          WHERE a.account_type = 'client'
          GROUP BY a.id
          ORDER BY activity_count DESC
          LIMIT ?
        `;
      } else if (metric === 'storage') {
        // Top by node count
        query = `
          SELECT
            a.id, a.name, a.account_class,
            COUNT(n.id) as node_count
          FROM accounts a
          LEFT JOIN nodes n ON n.account_id = a.id
          WHERE a.account_type = 'client'
          GROUP BY a.id
          ORDER BY node_count DESC
          LIMIT ?
        `;
      } else {
        return res.status(400).json({ error: 'Invalid metric. Use "usage" or "storage"' });
      }

      const topAccounts = database.prepare(query).all(Number(limit));

      return res.json({ accounts: topAccounts });
    } catch (error: any) {
      console.error('Top accounts error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch top accounts' });
    }
  });

  /**
   * GET /api/v1/analytics/recent-activity
   * Get recent activity
   * - Admin (no operating context): system-wide activity
   * - Admin (in CRM mode): account-scoped activity
   * - Client users: account-scoped activity
   */
  router.get('/recent-activity', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const isAdmin = req.user?.accountType === 'admin';
      const targetAccountId = req.operating?.accountId || req.user?.accountId;
      const isSystemWideView = isAdmin && !req.operating;
      const { limit = 50 } = req.query;

      let recentActivity: any[];

      if (isSystemWideView) {
        // System-wide activity
        recentActivity = database
          .prepare(
            `
          SELECT
            al.*,
            u.email as user_email,
            u.name as user_name,
            a.name as account_name
          FROM audit_log al
          LEFT JOIN users u ON u.id = al.actor_user_id
          LEFT JOIN accounts a ON a.id = al.actor_account_id
          ORDER BY al.timestamp DESC
          LIMIT ?
        `
          )
          .all(Number(limit));
      } else {
        // Account-scoped activity
        recentActivity = database
          .prepare(
            `
          SELECT
            al.*,
            u.email as user_email,
            u.name as user_name,
            a.name as account_name
          FROM audit_log al
          LEFT JOIN users u ON u.id = al.actor_user_id
          LEFT JOIN accounts a ON a.id = al.actor_account_id
          WHERE al.actor_account_id = ?
          ORDER BY al.timestamp DESC
          LIMIT ?
        `
          )
          .all(targetAccountId, Number(limit));
      }

      return res.json({ activity: recentActivity });
    } catch (error: any) {
      console.error('Recent activity error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch recent activity' });
    }
  });

  /**
   * GET /api/v1/analytics/alerts
   * Get system alerts
   * - Admin (no operating context): system-wide alerts
   * - Admin (in CRM mode): account-scoped alerts
   * - Client users: account-scoped alerts
   */
  router.get('/alerts', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const isAdmin = req.user?.accountType === 'admin';
      const targetAccountId = req.operating?.accountId || req.user?.accountId;
      const isSystemWideView = isAdmin && !req.operating;
      const alerts: any[] = [];

      // Check for accounts approaching quota
      let accountsNearQuota: any[];

      if (isSystemWideView) {
        // System-wide: check all client accounts
        accountsNearQuota = database
          .prepare(
            `
          SELECT
            a.id, a.name, a.account_class,
            COUNT(n.id) as node_count
          FROM accounts a
          LEFT JOIN nodes n ON n.account_id = a.id
          WHERE a.account_type = 'client'
          GROUP BY a.id
          HAVING node_count > 8000
        `
          )
          .all();
      } else {
        // Account-scoped: check only target account
        accountsNearQuota = database
          .prepare(
            `
          SELECT
            a.id, a.name, a.account_class,
            COUNT(n.id) as node_count
          FROM accounts a
          LEFT JOIN nodes n ON n.account_id = a.id
          WHERE a.id = ?
          GROUP BY a.id
          HAVING node_count > 8000
        `
          )
          .all(targetAccountId);
      }

      accountsNearQuota.forEach((account: any) => {
        alerts.push({
          id: `quota-${account.id}`,
          type: 'warning',
          severity: 'medium',
          message: `Account "${account.name}" is approaching node limit (${account.node_count}/10000)`,
          created_at: Date.now(),
        });
      });

      // Check for failed jobs (would need jobs table)
      // TODO: Add more alert types (failed imports, system errors, security incidents)
      // Related: packages/db/src/sqlite/schema.sql (add system_alerts table)
      // See: docs/features/MONITORING.md (needs creation)

      return res.json({ alerts });
    } catch (error: any) {
      console.error('Alerts error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch alerts' });
    }
  });

  return router;
}
