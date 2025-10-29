/**
 * Audit Logger
 *
 * Logs security-sensitive events to the audit_log table for compliance and security monitoring
 */

import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'login_locked'
  | 'logout'
  | 'register'
  | 'password_change'
  | 'account_created'
  | 'account_deleted'
  | 'user_created'
  | 'user_deleted'
  | 'user_suspended'
  | 'user_activated'
  | 'permission_changed'
  | 'account_switched'
  | 'account_unlocked'
  | 'session_expired'
  | 'unauthorized_access';

export interface AuditLogEntry {
  event_type: AuditEventType;
  user_id?: string; // User performing the action (if authenticated)
  target_user_id?: string; // User being acted upon (for admin actions)
  account_id?: string; // Account context
  ip_address?: string; // Source IP
  user_agent?: string; // Browser/client info
  details?: Record<string, any>; // Additional context (will be JSON stringified)
  success: boolean; // Whether the action succeeded
  error_message?: string; // Error details if failed
}

/**
 * Map audit event types to database-compatible action values
 * Database action column CHECK constraint: ('read', 'create', 'update', 'delete', 'reset')
 */
function mapEventTypeToAction(
  eventType: AuditEventType
): 'read' | 'create' | 'update' | 'delete' | 'reset' {
  switch (eventType) {
    case 'login_success':
    case 'login_failure':
    case 'logout':
    case 'session_expired':
    case 'unauthorized_access':
      return 'read'; // Authentication is reading/accessing sessions

    case 'register':
    case 'account_created':
    case 'user_created':
      return 'create';

    case 'password_change':
    case 'account_switched':
    case 'permission_changed':
    case 'user_activated':
      return 'update';

    case 'account_deleted':
    case 'user_deleted':
    case 'user_suspended':
    case 'login_locked':
      return 'delete'; // Deactivation/suspension maps to delete

    case 'account_unlocked':
      return 'reset';

    default:
      return 'read'; // Safe default
  }
}

/**
 * Log an audit event to the database
 * Maps to existing audit_log schema with columns:
 * actor_user_id, actor_account_id, target_account_id, action, resource_type, resource_id,
 * mode, success, reason, ip_address, user_agent, metadata, timestamp
 */
export function logAuditEvent(database: Database.Database, entry: AuditLogEntry): void {
  const id = randomUUID();
  const now = Date.now();

  try {
    database
      .prepare(
        `INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode,
          success, reason, ip_address, user_agent, metadata, timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        entry.user_id || 'system',
        entry.account_id || 'system',
        entry.account_id || null,
        mapEventTypeToAction(entry.event_type), // Map event_type to valid action
        'auth',
        entry.user_id || null,
        'security',
        entry.success ? 1 : 0,
        entry.error_message || null,
        entry.ip_address || null,
        entry.user_agent || null,
        entry.details ? JSON.stringify(entry.details) : null,
        now
      );
  } catch (error) {
    // Don't let audit logging failures break the application
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Log successful login
 */
export function logLoginSuccess(
  database: Database.Database,
  userId: string,
  accountId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'login_success',
    user_id: userId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { email },
    success: true,
  });
}

/**
 * Log failed login attempt
 */
export function logLoginFailure(
  database: Database.Database,
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'login_failure',
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { email, reason },
    success: false,
    error_message: reason,
  });
}

/**
 * Log account lockout
 */
export function logAccountLockout(
  database: Database.Database,
  email: string,
  ipAddress?: string,
  userAgent?: string,
  lockoutMinutes?: number
): void {
  logAuditEvent(database, {
    event_type: 'login_locked',
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { email, lockout_minutes: lockoutMinutes },
    success: false,
    error_message: 'Account locked due to too many failed login attempts',
  });
}

/**
 * Log logout
 */
export function logLogout(
  database: Database.Database,
  userId: string,
  accountId: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'logout',
    user_id: userId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    success: true,
  });
}

/**
 * Log user registration
 */
export function logRegistration(
  database: Database.Database,
  userId: string,
  accountId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'register',
    user_id: userId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { email },
    success: true,
  });
}

/**
 * Log password change
 */
export function logPasswordChange(
  database: Database.Database,
  userId: string,
  accountId: string,
  ipAddress?: string,
  userAgent?: string,
  isReset: boolean = false
): void {
  logAuditEvent(database, {
    event_type: 'password_change',
    user_id: userId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { is_reset: isReset },
    success: true,
  });
}

/**
 * Log account creation (by admin)
 */
export function logAccountCreated(
  database: Database.Database,
  adminUserId: string,
  accountId: string,
  accountName: string,
  accountType: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'account_created',
    user_id: adminUserId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { account_name: accountName, account_type: accountType },
    success: true,
  });
}

/**
 * Log account deletion
 */
export function logAccountDeleted(
  database: Database.Database,
  adminUserId: string,
  accountId: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'account_deleted',
    user_id: adminUserId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    success: true,
  });
}

/**
 * Log user creation (by admin)
 */
export function logUserCreated(
  database: Database.Database,
  adminUserId: string,
  newUserId: string,
  newUserEmail: string,
  accountId: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'user_created',
    user_id: adminUserId,
    target_user_id: newUserId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { email: newUserEmail },
    success: true,
  });
}

/**
 * Log permission change
 */
export function logPermissionChanged(
  database: Database.Database,
  adminUserId: string,
  targetUserId: string,
  accountId: string,
  oldPermission: string,
  newPermission: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'permission_changed',
    user_id: adminUserId,
    target_user_id: targetUserId,
    account_id: accountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { old_permission: oldPermission, new_permission: newPermission },
    success: true,
  });
}

/**
 * Log account switching
 */
export function logAccountSwitch(
  database: Database.Database,
  userId: string,
  fromAccountId: string,
  toAccountId: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'account_switched',
    user_id: userId,
    account_id: toAccountId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { from_account: fromAccountId, to_account: toAccountId },
    success: true,
  });
}

/**
 * Log manual account unlock (by admin)
 */
export function logAccountUnlocked(
  database: Database.Database,
  adminUserId: string,
  targetEmail: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'account_unlocked',
    user_id: adminUserId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { target_email: targetEmail },
    success: true,
  });
}

/**
 * Log unauthorized access attempt
 */
export function logUnauthorizedAccess(
  database: Database.Database,
  userId: string | undefined,
  resource: string,
  requiredPermission: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent(database, {
    event_type: 'unauthorized_access',
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: { resource, required_permission: requiredPermission },
    success: false,
    error_message: 'Insufficient permissions',
  });
}

/**
 * Query audit log with filters
 */
export interface AuditLogFilter {
  event_type?: AuditEventType;
  user_id?: string;
  account_id?: string;
  start_date?: number; // Timestamp
  end_date?: number; // Timestamp
  success?: boolean;
  limit?: number;
}

export function queryAuditLog(database: Database.Database, filter: AuditLogFilter = {}): any[] {
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params: any[] = [];

  if (filter.event_type) {
    query += ' AND event_type = ?';
    params.push(filter.event_type);
  }

  if (filter.user_id) {
    query += ' AND user_id = ?';
    params.push(filter.user_id);
  }

  if (filter.account_id) {
    query += ' AND account_id = ?';
    params.push(filter.account_id);
  }

  if (filter.start_date) {
    query += ' AND created_at >= ?';
    params.push(filter.start_date);
  }

  if (filter.end_date) {
    query += ' AND created_at <= ?';
    params.push(filter.end_date);
  }

  if (filter.success !== undefined) {
    query += ' AND success = ?';
    params.push(filter.success ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC';

  if (filter.limit) {
    query += ' LIMIT ?';
    params.push(filter.limit);
  }

  return database.prepare(query).all(...params);
}

/**
 * Cleanup old audit log entries (for GDPR compliance / storage management)
 * Default: keep logs for 90 days
 */
export function cleanupOldAuditLogs(
  database: Database.Database,
  retentionDays: number = 90
): number {
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const result = database.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoffTime);

  return result.changes;
}
