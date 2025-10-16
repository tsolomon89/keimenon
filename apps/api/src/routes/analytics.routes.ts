import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import Database from 'better-sqlite3';

/**
 * Calculate estimated MRR based on account tiers
 * Note: This is a placeholder until proper subscription tracking is implemented
 */
function calculateEstimatedMRR(database: Database.Database): number {
  const accountsByTier = database.prepare(`
    SELECT
      account_class,
      COUNT(*) as count
    FROM accounts
    WHERE account_type = 'client'
    GROUP BY account_class
  `).all() as any[];

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
  const database = db.getDatabase();

  /**
   * GET /api/v1/analytics/overview
   * Get system-wide analytics overview (admin only)
   */
  router.get('/overview', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      // Account Metrics
      const accountStats = database.prepare(`
        SELECT
          COUNT(*) as total_accounts,
          SUM(CASE WHEN account_type = 'client' THEN 1 ELSE 0 END) as client_accounts,
          SUM(CASE WHEN account_class = 'free' THEN 1 ELSE 0 END) as free_tier,
          SUM(CASE WHEN account_class = 'professional' THEN 1 ELSE 0 END) as pro_tier,
          SUM(CASE WHEN account_class = 'business' THEN 1 ELSE 0 END) as business_tier
        FROM accounts
      `).get() as any;

      const totalSeats = database.prepare(`
        SELECT COUNT(*) as count FROM users WHERE is_active = 1
      `).get() as any;

      // User Activity (last 7 and 30 days)
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

      const activeUsers7d = database.prepare(`
        SELECT COUNT(DISTINCT actor_user_id) as count
        FROM audit_log
        WHERE timestamp > ?
      `).get(sevenDaysAgo) as any;

      const activeUsers30d = database.prepare(`
        SELECT COUNT(DISTINCT actor_user_id) as count
        FROM audit_log
        WHERE timestamp > ?
      `).get(thirtyDaysAgo) as any;

      // Calculate average session time (last 30 days)
      // Group actions by user and day, calculate time between first and last action
      const sessionTimeResult = database.prepare(`
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
      `).get(thirtyDaysAgo) as any;

      const avgSessionTime = sessionTimeResult?.avg_minutes || 0;

      // Storage & Resources
      const storageStats = database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM nodes) as total_nodes,
          (SELECT COUNT(*) FROM edges) as total_edges,
          (SELECT COUNT(*) FROM nodes WHERE kind = 'Source') as total_sources
      `).get() as any;

      // Calculate storage size from node properties
      const storageSizeResult = database.prepare(`
        SELECT SUM(LENGTH(properties)) as total_bytes
        FROM nodes
      `).get() as any;

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
          // TODO: Implement billing metrics when subscriptions table is added
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
   * Get top accounts by various metrics (admin only)
   */
  router.get('/top-accounts', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      const { metric = 'usage', limit = 10 } = req.query;

      let query = '';
      if (metric === 'usage') {
        // Top by activity
        query = `
          SELECT
            a.id, a.name, a.account_class,
            COUNT(DISTINCT al.id) as activity_count
          FROM accounts a
          LEFT JOIN users u ON u.account_id = a.id
          LEFT JOIN audit_log al ON al.actor_user_id = u.id
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
   * Get recent system activity (admin only)
   */
  router.get('/recent-activity', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      const { limit = 50 } = req.query;

      const recentActivity = database.prepare(`
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
      `).all(Number(limit));

      return res.json({ activity: recentActivity });
    } catch (error: any) {
      console.error('Recent activity error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch recent activity' });
    }
  });

  /**
   * GET /api/v1/analytics/alerts
   * Get system alerts (admin only)
   */
  router.get('/alerts', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      const alerts: any[] = [];

      // Check for accounts approaching quota
      const accountsNearQuota = database.prepare(`
        SELECT
          a.id, a.name, a.account_class,
          COUNT(n.id) as node_count
        FROM accounts a
        LEFT JOIN nodes n ON n.account_id = a.id
        WHERE a.account_type = 'client'
        GROUP BY a.id
        HAVING node_count > 8000
      `).all();

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
      // TODO: Add more alert types

      return res.json({ alerts });
    } catch (error: any) {
      console.error('Alerts error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch alerts' });
    }
  });

  return router;
}
