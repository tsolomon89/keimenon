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
import { appLogger } from '../../../utils/logger';

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
  /**
   * Atomically record a chunk as received (race-condition safe)
   * Returns the updated session
   */
  recordChunkAtomic(
    sessionId: string,
    accountId: string,
    chunkIndex: number
  ): Promise<UploadSession | null>;
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
      appLogger.debug('upload.session.created', {
        sessionId: session.id,
        fileName: session.fileName,
      });
      return session;
    } catch (error: any) {
      appLogger.error('upload.session.create_failed', {
        error: error.message,
        fileName: spec.fileName,
        fileSize: spec.fileSize,
      });
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
          data_tag = excluded.data_tag,
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

      appLogger.debug('upload.session.saved', {
        sessionId: session.id,
        status: session.status,
        progress: session.getProgress(),
      });
    } catch (error: any) {
      appLogger.error('upload.session.save_failed', {
        sessionId: session.id,
        fileName: session.fileName,
        status: session.status,
        error: error.message,
      });

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
      appLogger.error('upload.session.lookup_failed', {
        sessionId: id,
        accountId,
        error: error.message,
      });
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
      appLogger.error('upload.session.query_failed', {
        error: error.message,
        filters,
      });
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

      appLogger.debug('upload.session.cleanup_scan', { expiredCount: rows.length });

      return rows.map((row) => UploadSession.fromJSON(this.mapRowToJSON(row)));
    } catch (error: any) {
      appLogger.error('upload.session.cleanup_scan_failed', {
        error: error.message,
      });
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
        appLogger.debug('upload.session.delete_noop', {
          sessionId: id,
          accountId,
        });
        return;
      }

      appLogger.debug('upload.session.deleted', { sessionId: id, accountId });
    } catch (error: any) {
      appLogger.error('upload.session.delete_failed', {
        sessionId: id,
        accountId,
        error: error.message,
      });
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

      appLogger.info('upload.session.cancel_all', {
        cancelledCount: result.changes,
      });
    } catch (error: any) {
      appLogger.error('upload.session.cancel_all_failed', {
        error: error.message,
      });
      // Don't throw - this is best-effort during shutdown
    }
  }

  /**
   * Atomically record a chunk as received (race-condition safe)
   *
   * Uses SQLite's json_set() to atomically merge the chunk into the existing
   * chunks_received JSON object, avoiding race conditions with concurrent uploads.
   *
   * Also automatically transitions status to 'assembling' when all chunks received.
   */
  async recordChunkAtomic(
    sessionId: string,
    accountId: string,
    chunkIndex: number
  ): Promise<UploadSession | null> {
    try {
      const now = Date.now();

      // Atomic update: merge chunk into existing chunks_received JSON
      // json_set() creates the key if it doesn't exist, or updates it
      const updateStmt = this.db.prepare(`
        UPDATE upload_sessions
        SET
          chunks_received = json_set(
            COALESCE(chunks_received, '{}'),
            '$."' || ? || '"',
            1
          ),
          updated_at = ?,
          status = CASE
            WHEN (
              SELECT COUNT(*)
              FROM json_each(
                json_set(COALESCE(chunks_received, '{}'), '$."' || ? || '"', 1)
              )
            ) >= total_chunks
            THEN 'assembling'
            ELSE status
          END
        WHERE id = ? AND account_id = ? AND status = 'uploading'
      `);

      const result = updateStmt.run(
        chunkIndex.toString(),
        now,
        chunkIndex.toString(),
        sessionId,
        accountId
      );

      if (result.changes === 0) {
        appLogger.debug(
          `UploadSessionRepository.recordChunkAtomic no-op for session ${sessionId}, chunk ${chunkIndex}`
        );
        // Still try to load the session - it might exist but be in wrong status
        return this.findById(sessionId, accountId);
      }

      // Load and return the updated session
      const session = await this.findById(sessionId, accountId);

      if (session) {
        appLogger.debug('upload.session.chunk_recorded', {
          sessionId,
          accountId,
          chunkIndex,
          progress: session.getProgress(),
          status: session.status,
        });
      }

      return session;
    } catch (error: any) {
      appLogger.error('upload.session.chunk_record_failed', {
        sessionId,
        accountId,
        chunkIndex,
        error: error.message,
      });
      throw ErrorFactory.database(
        `Failed to record chunk: ${error.message}`,
        'UploadSessionRepository.recordChunkAtomic',
        { sessionId, accountId, chunkIndex, error: error.message }
      );
    }
  }
}
