import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import Database from 'better-sqlite3';

type BillingSnapshotRow = {
  mrr_cents: number | null;
  active_subscriptions: number | null;
  canceled_last_30d: number | null;
};

function computeBillingMetrics(
  database: Database.Database,
  options: { isSystemWideView: boolean; targetAccountId: string | null; sinceTimestamp: number }
): { mrr: number; churnRate: number; customerLtv: number } {
  const { isSystemWideView, targetAccountId, sinceTimestamp } = options;

  const billingSnapshot = isSystemWideView
    ? (database
        .prepare(
          `
        SELECT
          SUM(
            CASE
              WHEN status IN ('active', 'trialing') THEN
                CASE billing_period WHEN 'yearly' THEN amount_cents / 12.0 ELSE amount_cents END
              ELSE 0
            END
          ) AS mrr_cents,
          SUM(CASE WHEN status IN ('active', 'trialing') THEN 1 ELSE 0 END) AS active_subscriptions,
          SUM(CASE WHEN status = 'canceled' AND canceled_at >= ? THEN 1 ELSE 0 END) AS canceled_last_30d
        FROM subscriptions
      `
        )
        .get(sinceTimestamp) as BillingSnapshotRow)
    : (database
        .prepare(
          `
        SELECT
          SUM(
            CASE
              WHEN status IN ('active', 'trialing') THEN
                CASE billing_period WHEN 'yearly' THEN amount_cents / 12.0 ELSE amount_cents END
              ELSE 0
            END
          ) AS mrr_cents,
          SUM(CASE WHEN status IN ('active', 'trialing') THEN 1 ELSE 0 END) AS active_subscriptions,
          SUM(CASE WHEN status = 'canceled' AND canceled_at >= ? THEN 1 ELSE 0 END) AS canceled_last_30d
        FROM subscriptions
        WHERE account_id = ?
      `
        )
        .get(sinceTimestamp, targetAccountId) as BillingSnapshotRow);

  const mrr = Number((Number(billingSnapshot?.mrr_cents || 0) / 100).toFixed(2));
  const activeSubscriptions = Number(billingSnapshot?.active_subscriptions || 0);
  const canceledLast30d = Number(billingSnapshot?.canceled_last_30d || 0);

  const churnRate =
    activeSubscriptions > 0
      ? Number(((canceledLast30d / activeSubscriptions) * 100).toFixed(2))
      : 0;
  const arpa = activeSubscriptions > 0 ? mrr / activeSubscriptions : 0;
  const customerLtv = Number((churnRate > 0 ? arpa / (churnRate / 100) : arpa * 12).toFixed(2));

  return { mrr, churnRate, customerLtv };
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
        const stats = database
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

        accountStats = stats || {
          total_accounts: 0,
          client_accounts: 0,
          free_tier: 0,
          pro_tier: 0,
          business_tier: 0,
        };

        const seatsResult = database
          .prepare(
            `
          SELECT COUNT(*) as count
          FROM user_accounts ua
          JOIN users u ON u.id = ua.user_id
          WHERE ua.account_id = ? AND ua.status = 'active' AND u.is_active = 1
        `
          )
          .get(targetAccountId) as any;

        totalSeats = seatsResult || { count: 0 };
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

      // Processing metrics (persisted jobs table)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayMs = startOfToday.getTime();
      const last24HoursMs = now - 24 * 60 * 60 * 1000;

      const processingStats = isSystemWideView
        ? (database
            .prepare(
              `
            SELECT
              SUM(CASE WHEN status IN ('queued', 'running', 'blocked') THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status = 'succeeded' AND updated_at >= ? THEN 1 ELSE 0 END) as completed_today,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM jobs
          `
            )
            .get(startOfTodayMs) as any)
        : (database
            .prepare(
              `
            SELECT
              SUM(CASE WHEN status IN ('queued', 'running', 'blocked') THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status = 'succeeded' AND updated_at >= ? THEN 1 ELSE 0 END) as completed_today,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM jobs
            WHERE account_id = ?
          `
            )
            .get(startOfTodayMs, targetAccountId) as any);

      const throughputStats = isSystemWideView
        ? (database
            .prepare(
              `
            SELECT
              SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queue_depth,
              SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_jobs,
              SUM(CASE WHEN status = 'succeeded' AND updated_at >= ? THEN 1 ELSE 0 END) as throughput_24h,
              SUM(CASE WHEN status = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) as failures_24h
            FROM jobs
          `
            )
            .get(last24HoursMs, last24HoursMs) as any)
        : (database
            .prepare(
              `
            SELECT
              SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queue_depth,
              SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_jobs,
              SUM(CASE WHEN status = 'succeeded' AND updated_at >= ? THEN 1 ELSE 0 END) as throughput_24h,
              SUM(CASE WHEN status = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) as failures_24h
            FROM jobs
            WHERE account_id = ?
          `
            )
            .get(last24HoursMs, last24HoursMs, targetAccountId) as any);

      const lastHeartbeatResult = isSystemWideView
        ? (database
            .prepare(
              `
            SELECT MAX(timestamp) as last_heartbeat
            FROM job_events
            WHERE type = 'job.progress'
          `
            )
            .get() as any)
        : (database
            .prepare(
              `
            SELECT MAX(timestamp) as last_heartbeat
            FROM job_events
            WHERE type = 'job.progress' AND account_id = ?
          `
            )
            .get(targetAccountId) as any);

      let apiLatencyMs = 0;
      try {
        const latencyQuery = isSystemWideView
          ? database
              .prepare(
                `
              SELECT AVG(CAST(json_extract(metadata, '$.durationMs') AS REAL)) as avg_latency
              FROM audit_log
              WHERE timestamp >= ?
            `
              )
              .get(last24HoursMs)
          : database
              .prepare(
                `
              SELECT AVG(CAST(json_extract(metadata, '$.durationMs') AS REAL)) as avg_latency
              FROM audit_log
              WHERE timestamp >= ? AND actor_account_id = ?
            `
              )
              .get(last24HoursMs, targetAccountId);

        apiLatencyMs = Number(latencyQuery?.avg_latency || 0);
      } catch {
        apiLatencyMs = 0;
      }

      const throughput24h = Number(throughputStats?.throughput_24h || 0);
      const failures24h = Number(throughputStats?.failures_24h || 0);
      const errorRatePercent =
        throughput24h + failures24h > 0 ? (failures24h / (throughput24h + failures24h)) * 100 : 0;
      const lastHeartbeatTs = Number(lastHeartbeatResult?.last_heartbeat || 0);
      const workerHeartbeatAgeMs = lastHeartbeatTs > 0 ? Math.max(0, now - lastHeartbeatTs) : null;
      const uptimePercent = Math.max(0, Math.min(100, 100 - errorRatePercent));

      const thirtyDaysAgoForBilling = now - 30 * 24 * 60 * 60 * 1000;
      const billingMetrics = computeBillingMetrics(database, {
        isSystemWideView,
        targetAccountId: targetAccountId ?? null,
        sinceTimestamp: thirtyDaysAgoForBilling,
      });

      const systemHealth = {
        api_latency_ms: Math.round(apiLatencyMs),
        error_rate: Number(errorRatePercent.toFixed(2)),
        uptime_percent: Number(uptimePercent.toFixed(2)),
        queue_depth: Number(throughputStats?.queue_depth || 0),
        running_jobs: Number(throughputStats?.running_jobs || 0),
        throughput_24h: throughput24h,
        worker_heartbeat_age_ms: workerHeartbeatAgeMs,
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
        processing: {
          active: Number(processingStats?.active || 0),
          completed_today: Number(processingStats?.completed_today || 0),
          failed: Number(processingStats?.failed || 0),
        },
        billing: {
          mrr: billingMetrics.mrr,
          churn_rate: billingMetrics.churnRate,
          customer_ltv: billingMetrics.customerLtv,
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
      const limit = Math.max(
        1,
        Math.min(200, Number.parseInt(String(req.query.limit ?? '100'), 10) || 100)
      );
      const statusFilter = req.query.status;

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (!isSystemWideView) {
        whereClauses.push('(account_id = ? OR account_id IS NULL)');
        params.push(targetAccountId);
      }

      if (
        statusFilter === 'active' ||
        statusFilter === 'acknowledged' ||
        statusFilter === 'resolved'
      ) {
        whereClauses.push('status = ?');
        params.push(statusFilter);
      } else {
        whereClauses.push("status <> 'resolved'");
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const rows = database
        .prepare(
          `
          SELECT
            id,
            account_id,
            source,
            type,
            severity,
            status,
            message,
            metadata,
            created_at,
            updated_at,
            resolved_at
          FROM system_alerts
          ${whereSql}
          ORDER BY
            CASE severity
              WHEN 'critical' THEN 4
              WHEN 'high' THEN 3
              WHEN 'medium' THEN 2
              ELSE 1
            END DESC,
            created_at DESC
          LIMIT ?
        `
        )
        .all(...params, limit) as any[];

      const alerts = rows.map((row) => ({
        id: row.id,
        account_id: row.account_id,
        source: row.source,
        type: row.type,
        severity: row.severity,
        status: row.status,
        message: row.message,
        metadata: (() => {
          if (typeof row.metadata !== 'string' || row.metadata.length === 0) {
            return null;
          }
          try {
            return JSON.parse(row.metadata);
          } catch {
            return null;
          }
        })(),
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolved_at: row.resolved_at,
      }));

      return res.json({ alerts, count: alerts.length });
    } catch (error: any) {
      console.error('Alerts error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch alerts' });
    }
  });

  return router;
}
