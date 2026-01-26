import { randomUUID } from 'crypto';
import { Request } from 'express';
import { SQLiteClient } from '@keimenon/db';

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  actor_account_id: string;
  target_account_id?: string;
  action: 'read' | 'create' | 'update' | 'delete';
  resource_type: 'source' | 'user' | 'account' | 'settings' | 'edge' | 'node' | 'board' | 'group';
  resource_id?: string;
  mode: 'native' | 'crm' | 'nested';
  success: boolean;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface AuditLogFilters {
  actor_user_id?: string;
  actor_account_id?: string;
  target_account_id?: string;
  action?: string;
  resource_type?: string;
  mode?: string;
  success?: boolean;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

/**
 * Service for logging and retrieving audit logs
 * Tracks all privileged actions, especially cross-tenant operations
 */
export class AuditService {
  constructor(private db: SQLiteClient) {}

  /**
   * Log an action to the audit log
   */
  async logAction(params: {
    req: Request;
    action: 'read' | 'create' | 'update' | 'delete';
    resourceType: 'source' | 'user' | 'account' | 'settings' | 'edge' | 'node' | 'board' | 'group';
    resourceId?: string;
    success: boolean;
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { req, action, resourceType, resourceId, success, reason, metadata } = params;

    // Extract user info from request
    if (!req.user) {
      console.warn('Audit log: No user in request, skipping');
      return;
    }

    const database = this.db.getDatabase();
    const now = Date.now();
    const id = randomUUID();

    // Extract IP and user agent
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Determine mode and target account
    const mode = req.operating?.mode || 'native';
    const targetAccountId =
      req.operating?.accountId !== req.user.accountId ? req.operating?.accountId : undefined;

    const entry: AuditLogEntry = {
      id,
      actor_user_id: req.user.userId,
      actor_account_id: req.user.accountId,
      target_account_id: targetAccountId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      mode,
      success,
      reason,
      ip_address: ip,
      user_agent: userAgent,
      metadata,
      timestamp: now,
    };

    try {
      database
        .prepare(
          `INSERT INTO audit_log
          (id, actor_user_id, actor_account_id, target_account_id, action, resource_type, resource_id, mode, success, reason, ip_address, user_agent, metadata, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entry.id,
          entry.actor_user_id,
          entry.actor_account_id,
          entry.target_account_id || null,
          entry.action,
          entry.resource_type,
          entry.resource_id || null,
          entry.mode,
          entry.success ? 1 : 0,
          entry.reason || null,
          entry.ip_address,
          entry.user_agent,
          metadata ? JSON.stringify(metadata) : null,
          entry.timestamp
        );
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - audit failures shouldn't break the app
    }
  }

  /**
   * Quick helper to log successful action
   */
  async logSuccess(params: {
    req: Request;
    action: 'read' | 'create' | 'update' | 'delete';
    resourceType: 'source' | 'user' | 'account' | 'settings' | 'edge' | 'node' | 'board' | 'group';
    resourceId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    return this.logAction({ ...params, success: true });
  }

  /**
   * Quick helper to log failed action
   */
  async logFailure(params: {
    req: Request;
    action: 'read' | 'create' | 'update' | 'delete';
    resourceType: 'source' | 'user' | 'account' | 'settings' | 'edge' | 'node' | 'board' | 'group';
    resourceId?: string;
    reason: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    return this.logAction({ ...params, success: false });
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
    const database = this.db.getDatabase();

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.actor_user_id) {
      conditions.push('actor_user_id = ?');
      params.push(filters.actor_user_id);
    }

    if (filters.actor_account_id) {
      conditions.push('actor_account_id = ?');
      params.push(filters.actor_account_id);
    }

    if (filters.target_account_id) {
      conditions.push('target_account_id = ?');
      params.push(filters.target_account_id);
    }

    if (filters.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    if (filters.resource_type) {
      conditions.push('resource_type = ?');
      params.push(filters.resource_type);
    }

    if (filters.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }

    if (filters.success !== undefined) {
      conditions.push('success = ?');
      params.push(filters.success ? 1 : 0);
    }

    if (filters.startDate) {
      conditions.push('timestamp >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push('timestamp <= ?');
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT * FROM audit_log
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const rows = database.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_account_id: row.actor_account_id,
      target_account_id: row.target_account_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      mode: row.mode,
      success: row.success === 1,
      reason: row.reason,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get audit log count with filters
   */
  async getAuditLogCount(filters: AuditLogFilters = {}): Promise<number> {
    const database = this.db.getDatabase();

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.actor_user_id) {
      conditions.push('actor_user_id = ?');
      params.push(filters.actor_user_id);
    }

    if (filters.actor_account_id) {
      conditions.push('actor_account_id = ?');
      params.push(filters.actor_account_id);
    }

    if (filters.target_account_id) {
      conditions.push('target_account_id = ?');
      params.push(filters.target_account_id);
    }

    if (filters.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    if (filters.resource_type) {
      conditions.push('resource_type = ?');
      params.push(filters.resource_type);
    }

    if (filters.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }

    if (filters.success !== undefined) {
      conditions.push('success = ?');
      params.push(filters.success ? 1 : 0);
    }

    if (filters.startDate) {
      conditions.push('timestamp >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push('timestamp <= ?');
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `SELECT COUNT(*) as count FROM audit_log ${whereClause}`;

    const result = database.prepare(query).get(...params) as any;

    return result.count;
  }

  /**
   * Get recent audit logs for a user
   */
  async getUserRecentLogs(userId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    return this.getAuditLogs({
      actor_user_id: userId,
      limit,
    });
  }

  /**
   * Get recent audit logs for an account
   */
  async getAccountRecentLogs(accountId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    return this.getAuditLogs({
      actor_account_id: accountId,
      limit,
    });
  }

  /**
   * Get cross-tenant operations (admin viewing/modifying client accounts)
   */
  async getCrossTenantLogs(limit: number = 100): Promise<AuditLogEntry[]> {
    const database = this.db.getDatabase();

    const query = `
      SELECT * FROM audit_log
      WHERE target_account_id IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = database.prepare(query).all(limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_account_id: row.actor_account_id,
      target_account_id: row.target_account_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      mode: row.mode,
      success: row.success === 1,
      reason: row.reason,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get failed operations (security monitoring)
   */
  async getFailedOperations(limit: number = 100): Promise<AuditLogEntry[]> {
    return this.getAuditLogs({
      success: false,
      limit,
    });
  }

  /**
   * Clean up old audit logs (optional retention policy)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const database = this.db.getDatabase();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const result = database.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoffTime);

    return result.changes;
  }
}
