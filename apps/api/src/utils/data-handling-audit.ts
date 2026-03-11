import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Request } from 'express';

type AuditAction = 'read' | 'create' | 'update' | 'delete' | 'reset';
type AuditMode = 'native' | 'crm' | 'nested';

export interface DataHandlingAuditEntry {
  actorUserId: string;
  actorAccountId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  mode?: AuditMode;
  targetAccountId?: string;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export function resolveAuditDatabaseHandle(value: unknown): Database.Database | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    prepare?: unknown;
    db?: unknown;
    getDatabase?: () => unknown;
  };

  if (typeof candidate.prepare === 'function') {
    return candidate as Database.Database;
  }

  if (candidate.db && typeof (candidate.db as any).prepare === 'function') {
    return candidate.db as Database.Database;
  }

  if (typeof candidate.getDatabase === 'function') {
    const db = candidate.getDatabase();
    if (db && typeof (db as any).prepare === 'function') {
      return db as Database.Database;
    }
  }

  return null;
}

export function recordDataHandlingAudit(
  dbHandleCandidate: unknown,
  entry: DataHandlingAuditEntry
): boolean {
  const db = resolveAuditDatabaseHandle(dbHandleCandidate);
  if (!db) {
    return false;
  }

  try {
    db.prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, actor_account_id, target_account_id,
        action, resource_type, resource_id, mode,
        success, reason, ip_address, user_agent, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      entry.actorUserId,
      entry.actorAccountId,
      entry.targetAccountId ?? entry.actorAccountId,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.mode ?? 'native',
      entry.success ? 1 : 0,
      entry.reason ?? null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.timestamp ?? Date.now()
    );

    return true;
  } catch (error) {
    console.warn('[DataHandlingAudit] Failed to persist audit event:', error);
    return false;
  }
}

export function buildAuditContextFromRequest(req: Request): {
  actorUserId: string | null;
  actorAccountId: string | null;
  mode: AuditMode;
  targetAccountId?: string;
  ipAddress?: string;
  userAgent?: string;
} {
  const actorUserId = req.user?.userId ?? null;
  const actorAccountId = req.user?.accountId ?? null;
  const mode = (req.operating?.mode || 'native') as AuditMode;
  const targetAccountId =
    req.operating?.accountId && req.operating.accountId !== actorAccountId
      ? req.operating.accountId
      : undefined;

  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined) ||
    req.socket?.remoteAddress ||
    undefined;
  const userAgent = req.headers['user-agent'] || undefined;

  return {
    actorUserId,
    actorAccountId,
    mode,
    targetAccountId,
    ipAddress,
    userAgent,
  };
}
