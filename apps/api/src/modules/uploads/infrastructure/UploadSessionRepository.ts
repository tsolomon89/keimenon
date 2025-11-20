/**
 * UploadSessionRepository
 *
 * Persistence layer for UploadSession aggregate.
 * Handles saving/loading upload sessions from SQLite.
 *
 * Responsibilities:
 * - Save session state to database
 * - Load session by ID with multi-tenant isolation
 * - Find expired sessions for cleanup
 * - Delete sessions and associated chunk files
 * - Enforce multi-tenant isolation (account_id)
 *
 * Related: Chunked Upload System - Phase 1
 */

import {
  UploadSession,
  UploadSessionSpec,
  UploadSessionJSON,
  UploadStatus,
} from '../domain/UploadSession';
import Database from 'better-sqlite3';
import { ErrorFactory } from '../../../middleware/error-handler.middleware';

export interface UploadSessionFilters {
  accountId?: string;
  userId?: string;
  status?: UploadStatus | UploadStatus[];
  limit?: number;
  offset?: number;
}

export interface UploadSessionRepository {
  create(spec: UploadSessionSpec): Promise<UploadSession>;
  save(session: UploadSession): Promise<void>;
  findById(id: string, accountId: string): Promise<UploadSession | null>;
  find(filters: UploadSessionFilters): Promise<UploadSession[]>;
  findExpired(): Promise<UploadSession[]>;
  delete(id: string, accountId: string): Promise<void>;
  cancelAll(): Promise<void>;
}

/**
 * SQLite implementation of UploadSessionRepository
 */
export class SQLiteUploadSessionRepository implements UploadSessionRepository {
  constructor(private db: Database.Database) {}

  /**
   * Map snake_case database columns to camelCase for UploadSession.fromJSON()
   */
  private mapRowToJSON(row: any): UploadSessionJSON {
    return {
      id: row.id,
      accountId: row.account_id,
      userId: row.user_id,
      jobId: row.job_id,
      fileName: row.file_name,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      chunkSize: row.chunk_size,
      totalChunks: row.total_chunks,
      chunksReceived: row.chunks_received,
      chunksPath: row.chunks_path,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      isLocal: Boolean(row.is_local),
      dataTag: row.data_tag,
      metadata: row.metadata,
    };
  }

  /**
   * Create a new upload session
   */
  async create(spec: UploadSessionSpec): Promise<UploadSession> {
    try {
      const session = UploadSession.create(spec);
      await this.save(session);
      console.log(
        `[UploadSessionRepository] ✅ Created session ${session.id} (${session.fileName})`
      );
      return session;
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to create session:`, error);
      throw ErrorFactory.database(
        `Failed to create upload session: ${error.message}`,
        'UploadSessionRepository.create',
        { fileName: spec.fileName, fileSize: spec.fileSize, error: error.message }
      );
    }
  }

  /**
   * Save session state to database (upsert)
   */
  async save(session: UploadSession): Promise<void> {
    try {
      const json = session.toJSON();

      const stmt = this.db.prepare(`
        INSERT INTO upload_sessions (
          id, account_id, user_id, job_id,
          file_name, file_size, mime_type,
          chunk_size, total_chunks,
          chunks_received, chunks_path,
          status, error_message,
          created_at, updated_at, expires_at, completed_at,
          is_local, data_tag, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          job_id = excluded.job_id,
          chunks_received = excluded.chunks_received,
          status = excluded.status,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at,
          metadata = excluded.metadata
      `);

      stmt.run(
        json.id,
        json.accountId,
        json.userId,
        json.jobId,
        json.fileName,
        json.fileSize,
        json.mimeType,
        json.chunkSize,
        json.totalChunks,
        JSON.stringify(json.chunksReceived), // Serialize Map to JSON string
        json.chunksPath,
        json.status,
        json.errorMessage,
        json.createdAt,
        json.updatedAt,
        json.expiresAt,
        json.completedAt,
        json.isLocal ? 1 : 0,
        json.dataTag,
        json.metadata ? JSON.stringify(json.metadata) : null
      );

      console.log(
        `[UploadSessionRepository] ✅ Saved session ${session.id} (${session.status}, ${session.getProgress()}%)`
      );
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to save session ${session.id}:`);
      console.error(`   Session ID: ${session.id}`);
      console.error(`   File: ${session.fileName}`);
      console.error(`   Status: ${session.status}`);
      console.error(`   Error: ${error.message}`);

      throw ErrorFactory.database(
        `Failed to save upload session: ${error.message}`,
        'UploadSessionRepository.save',
        { sessionId: session.id, error: error.message }
      );
    }
  }

  /**
   * Find session by ID with multi-tenant isolation
   */
  async findById(id: string, accountId: string): Promise<UploadSession | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM upload_sessions
        WHERE id = ? AND account_id = ?
      `);

      const row = stmt.get(id, accountId) as any;

      if (!row) {
        return null;
      }

      return UploadSession.fromJSON(this.mapRowToJSON(row));
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to find session ${id}:`, error);
      throw ErrorFactory.database(
        `Failed to load upload session: ${error.message}`,
        'UploadSessionRepository.findById',
        { sessionId: id, accountId, error: error.message }
      );
    }
  }

  /**
   * Find sessions by filters
   */
  async find(filters: UploadSessionFilters): Promise<UploadSession[]> {
    try {
      let sql = 'SELECT * FROM upload_sessions WHERE 1=1';
      const params: any[] = [];

      if (filters.accountId) {
        sql += ' AND account_id = ?';
        params.push(filters.accountId);
      }

      if (filters.userId) {
        sql += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          sql += ` AND status IN (${filters.status.map(() => '?').join(',')})`;
          params.push(...filters.status);
        } else {
          sql += ' AND status = ?';
          params.push(filters.status);
        }
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map((row) => UploadSession.fromJSON(this.mapRowToJSON(row)));
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to find sessions:`, error);
      throw ErrorFactory.database(
        `Failed to find upload sessions: ${error.message}`,
        'UploadSessionRepository.find',
        { filters, error: error.message }
      );
    }
  }

  /**
   * Find expired sessions for cleanup
   */
  async findExpired(): Promise<UploadSession[]> {
    try {
      const now = Date.now();

      const stmt = this.db.prepare(`
        SELECT * FROM upload_sessions
        WHERE expires_at < ?
          AND status IN ('uploading', 'assembling')
        ORDER BY created_at ASC
        LIMIT 100
      `);

      const rows = stmt.all(now) as any[];

      console.log(`[UploadSessionRepository] Found ${rows.length} expired sessions for cleanup`);

      return rows.map((row) => UploadSession.fromJSON(this.mapRowToJSON(row)));
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to find expired sessions:`, error);
      throw ErrorFactory.database(
        `Failed to find expired sessions: ${error.message}`,
        'UploadSessionRepository.findExpired',
        { error: error.message }
      );
    }
  }

  /**
   * Delete session from database
   * Note: Chunk file cleanup must be done by caller
   */
  async delete(id: string, accountId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM upload_sessions
        WHERE id = ? AND account_id = ?
      `);

      const result = stmt.run(id, accountId);

      if (result.changes === 0) {
        console.warn(
          `[UploadSessionRepository] ⚠️ Session ${id} not found or access denied (accountId: ${accountId})`
        );
        return;
      }

      console.log(`[UploadSessionRepository] ✅ Deleted session ${id}`);
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to delete session ${id}:`, error);
      throw ErrorFactory.database(
        `Failed to delete upload session: ${error.message}`,
        'UploadSessionRepository.delete',
        { sessionId: id, accountId, error: error.message }
      );
    }
  }

  /**
   * Cancel all in-progress uploads (for graceful shutdown)
   */
  async cancelAll(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE upload_sessions
        SET status = 'expired',
            error_message = 'Server shutdown',
            updated_at = ?
        WHERE status IN ('uploading', 'assembling')
      `);

      const result = stmt.run(Date.now());

      console.log(`[UploadSessionRepository] ✅ Cancelled ${result.changes} in-progress uploads`);
    } catch (error: any) {
      console.error(`[UploadSessionRepository] ❌ Failed to cancel uploads:`, error);
      // Don't throw - this is best-effort during shutdown
    }
  }
}
