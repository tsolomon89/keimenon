/**
 * UploadSessionRepository Tests
 *
 * Tests for the SQLite persistence layer of upload sessions.
 * Validates database operations, multi-tenant isolation, and error handling.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  SQLiteUploadSessionRepository,
  UploadSessionRepository,
  UploadSessionFilters,
} from '../infrastructure/UploadSessionRepository';
import { UploadSession, UploadSessionSpec } from '../domain/UploadSession';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

describe('UploadSessionRepository', () => {
  let db: Database.Database;
  let repository: UploadSessionRepository;
  let testDbPath: string;

  beforeEach(() => {
    // Create in-memory database for testing
    testDbPath = join(tmpdir(), `test-upload-sessions-${randomUUID()}.db`);
    db = new Database(':memory:'); // Use in-memory for speed

    // Create upload_sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        chunk_size INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        chunks_received TEXT NOT NULL,
        chunks_path TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        completed_at INTEGER,
        is_local INTEGER NOT NULL DEFAULT 1,
        data_tag TEXT NOT NULL DEFAULT 'real'
      );

      CREATE INDEX IF NOT EXISTS idx_upload_sessions_account_id ON upload_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions(expires_at);
    `);

    repository = new SQLiteUploadSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createSessionSpec(overrides?: Partial<UploadSessionSpec>): UploadSessionSpec {
    return {
      accountId: 'acc_test123',
      userId: 'usr_test456',
      jobId: 'job_test789',
      fileName: 'test-file.json',
      fileSize: 50 * 1024 * 1024, // 50MB
      mimeType: 'application/json',
      chunkSize: 10 * 1024 * 1024, // 10MB
      ...overrides,
    };
  }

  // ============================================================================
  // create()
  // ============================================================================

  describe('create()', () => {
    it('should create a new upload session and save to database', async () => {
      const spec = createSessionSpec();
      const session = await repository.create(spec);

      expect(session.id).toMatch(/^upl_/);
      expect(session.accountId).toBe(spec.accountId);
      expect(session.userId).toBe(spec.userId);
      expect(session.fileName).toBe(spec.fileName);
      expect(session.fileSize).toBe(spec.fileSize);

      // Verify it was saved to database
      const loaded = await repository.findById(session.id, spec.accountId);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
    });

    it('should create sessions for different accounts', async () => {
      const session1 = await repository.create(createSessionSpec({ accountId: 'acc_1' }));
      const session2 = await repository.create(createSessionSpec({ accountId: 'acc_2' }));

      expect(session1.accountId).toBe('acc_1');
      expect(session2.accountId).toBe('acc_2');
      expect(session1.id).not.toBe(session2.id);
    });

    it('should handle database errors gracefully', async () => {
      // Close database to trigger error
      db.close();

      await expect(repository.create(createSessionSpec())).rejects.toThrow();
    });
  });

  // ============================================================================
  // save()
  // ============================================================================

  describe('save()', () => {
    it('should insert new session into database', async () => {
      const spec = createSessionSpec();
      const session = UploadSession.create(spec);

      await repository.save(session);

      // Verify it's in database
      const stmt = db.prepare('SELECT * FROM upload_sessions WHERE id = ?');
      const row = stmt.get(session.id);

      expect(row).toBeDefined();
      expect((row as any).id).toBe(session.id);
      expect((row as any).file_name).toBe(session.fileName);
    });

    it('should update existing session (upsert)', async () => {
      const session = await repository.create(createSessionSpec());

      // Modify session
      session.recordChunk(0);
      session.recordChunk(1);

      // Save updated session
      await repository.save(session);

      // Reload from database
      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.getProgress()).toBe(40); // 2/5 chunks = 40%
    });

    it('should serialize chunksReceived as JSON string', async () => {
      const session = await repository.create(createSessionSpec());
      session.recordChunk(0);
      session.recordChunk(2);

      await repository.save(session);

      // Check database directly
      const stmt = db.prepare('SELECT chunks_received FROM upload_sessions WHERE id = ?');
      const row = stmt.get(session.id) as any;

      expect(typeof row.chunks_received).toBe('string');

      const parsed = JSON.parse(row.chunks_received);
      expect(parsed).toEqual({ 0: true, 2: true });
    });

    it('should update status transitions', async () => {
      const session = await repository.create(createSessionSpec());

      // Transition to assembling
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      await repository.save(session);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('assembling');
    });

    it('should save error message when session fails', async () => {
      const session = await repository.create(createSessionSpec());

      session.markFailed('Network timeout');
      await repository.save(session);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('failed');
      expect(loaded!.errorMessage).toBe('Network timeout');
    });

    it('should save completed timestamp', async () => {
      const session = await repository.create(createSessionSpec());

      // Complete upload
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }
      session.markCompleted();

      await repository.save(session);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.completedAt).toBeDefined();
      expect(loaded!.completedAt).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // findById()
  // ============================================================================

  describe('findById()', () => {
    it('should find session by ID', async () => {
      const session = await repository.create(createSessionSpec());

      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.fileName).toBe(session.fileName);
    });

    it('should return null for non-existent session', async () => {
      const loaded = await repository.findById('upl_nonexistent', 'acc_test123');

      expect(loaded).toBeNull();
    });

    it('should enforce multi-tenant isolation (account_id)', async () => {
      const session = await repository.create(createSessionSpec({ accountId: 'acc_alice' }));

      // Try to load with different account ID
      const loaded = await repository.findById(session.id, 'acc_bob');

      expect(loaded).toBeNull(); // Should not find session from different account
    });

    it('should correctly deserialize chunksReceived', async () => {
      const session = await repository.create(createSessionSpec());
      session.recordChunk(1);
      session.recordChunk(3);
      await repository.save(session);

      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.getMissingChunks()).toEqual([0, 2, 4]);
      expect(loaded!.getProgress()).toBe(40); // 2/5 = 40%
    });

    it('should handle empty chunksReceived', async () => {
      const session = await repository.create(createSessionSpec());

      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.getMissingChunks()).toEqual([0, 1, 2, 3, 4]);
      expect(loaded!.getProgress()).toBe(0);
    });
  });

  // ============================================================================
  // find()
  // ============================================================================

  describe('find()', () => {
    beforeEach(async () => {
      // Create test sessions for different accounts and statuses
      await repository.create(createSessionSpec({ accountId: 'acc_alice', userId: 'usr_alice' }));
      await repository.create(createSessionSpec({ accountId: 'acc_alice', userId: 'usr_alice' }));
      await repository.create(createSessionSpec({ accountId: 'acc_bob', userId: 'usr_bob' }));

      // Create session with different status
      const failedSession = await repository.create(
        createSessionSpec({ accountId: 'acc_alice', userId: 'usr_alice' })
      );
      failedSession.markFailed('Test error');
      await repository.save(failedSession);
    });

    it('should find all sessions without filters', async () => {
      const sessions = await repository.find({});

      expect(sessions.length).toBeGreaterThanOrEqual(4);
    });

    it('should filter by accountId', async () => {
      const sessions = await repository.find({ accountId: 'acc_alice' });

      expect(sessions.length).toBe(3);
      expect(sessions.every((s) => s.accountId === 'acc_alice')).toBe(true);
    });

    it('should filter by userId', async () => {
      const sessions = await repository.find({ userId: 'usr_bob' });

      expect(sessions.length).toBe(1);
      expect(sessions[0].userId).toBe('usr_bob');
    });

    it('should filter by single status', async () => {
      const sessions = await repository.find({ status: 'uploading' });

      expect(sessions.length).toBe(3);
      expect(sessions.every((s) => s.status === 'uploading')).toBe(true);
    });

    it('should filter by multiple statuses', async () => {
      const sessions = await repository.find({ status: ['uploading', 'failed'] });

      expect(sessions.length).toBe(4);
      expect(sessions.every((s) => s.status === 'uploading' || s.status === 'failed')).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const sessions = await repository.find({
        accountId: 'acc_alice',
        status: 'uploading',
      });

      expect(sessions.length).toBe(2);
      expect(sessions.every((s) => s.accountId === 'acc_alice' && s.status === 'uploading')).toBe(
        true
      );
    });

    it('should limit results', async () => {
      const sessions = await repository.find({ limit: 2 });

      expect(sessions.length).toBe(2);
    });

    it('should offset results', async () => {
      const allSessions = await repository.find({});
      const offsetSessions = await repository.find({ offset: 1, limit: 2 });

      expect(offsetSessions.length).toBe(2);
      expect(offsetSessions[0].id).toBe(allSessions[1].id);
    });

    it('should order by created_at DESC', async () => {
      const sessions = await repository.find({});

      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].createdAt).toBeGreaterThanOrEqual(sessions[i].createdAt);
      }
    });

    it('should return empty array when no matches', async () => {
      const sessions = await repository.find({ accountId: 'acc_nonexistent' });

      expect(sessions).toEqual([]);
    });
  });

  // ============================================================================
  // findExpired()
  // ============================================================================

  describe('findExpired()', () => {
    it('should find expired sessions', async () => {
      // Create session and manually expire it
      const session = await repository.create(createSessionSpec());

      // Manually set expiry to past
      const stmt = db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?');
      stmt.run(Date.now() - 1000, session.id);

      const expired = await repository.findExpired();

      expect(expired.length).toBeGreaterThanOrEqual(1);
      expect(expired.some((s) => s.id === session.id)).toBe(true);
    });

    it('should not return completed sessions', async () => {
      // Create completed session with past expiry
      const session = await repository.create(createSessionSpec());

      // Mark as completed
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }
      session.markCompleted();
      await repository.save(session);

      // Manually set expiry to past
      const stmt = db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?');
      stmt.run(Date.now() - 1000, session.id);

      const expired = await repository.findExpired();

      // Should not include completed session
      expect(expired.every((s) => s.id !== session.id)).toBe(true);
    });

    it('should not return failed sessions', async () => {
      const session = await repository.create(createSessionSpec());
      session.markFailed('Test error');
      await repository.save(session);

      // Manually set expiry to past
      const stmt = db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?');
      stmt.run(Date.now() - 1000, session.id);

      const expired = await repository.findExpired();

      // Should not include failed session
      expect(expired.every((s) => s.id !== session.id)).toBe(true);
    });

    it('should only return uploading and assembling sessions', async () => {
      const expired = await repository.findExpired();

      expect(expired.every((s) => s.status === 'uploading' || s.status === 'assembling')).toBe(
        true
      );
    });

    it('should limit to 100 results', async () => {
      // Create many expired sessions
      for (let i = 0; i < 150; i++) {
        const session = await repository.create(
          createSessionSpec({
            accountId: `acc_test_${i}`,
            fileName: `file_${i}.json`,
          })
        );

        // Set expiry to past
        const stmt = db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?');
        stmt.run(Date.now() - 1000, session.id);
      }

      const expired = await repository.findExpired();

      expect(expired.length).toBeLessThanOrEqual(100);
    });

    it('should order by created_at ASC (oldest first)', async () => {
      // Create multiple expired sessions with delays
      const sessions: string[] = [];

      for (let i = 0; i < 3; i++) {
        const session = await repository.create(createSessionSpec({ fileName: `file_${i}.json` }));
        sessions.push(session.id);

        // Wait a bit to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Expire all sessions
      for (const id of sessions) {
        const stmt = db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?');
        stmt.run(Date.now() - 1000, id);
      }

      const expired = await repository.findExpired();
      const expiredIds = expired.map((s) => s.id);

      // Should be ordered oldest first
      for (let i = 1; i < expiredIds.length; i++) {
        const prevIndex = sessions.indexOf(expiredIds[i - 1]);
        const currIndex = sessions.indexOf(expiredIds[i]);
        if (prevIndex !== -1 && currIndex !== -1) {
          expect(prevIndex).toBeLessThan(currIndex);
        }
      }
    });

    it('should return empty array when no expired sessions', async () => {
      // Create session with future expiry
      await repository.create(createSessionSpec());

      const expired = await repository.findExpired();

      expect(expired).toEqual([]);
    });
  });

  // ============================================================================
  // delete()
  // ============================================================================

  describe('delete()', () => {
    it('should delete session from database', async () => {
      const session = await repository.create(createSessionSpec());

      await repository.delete(session.id, session.accountId);

      // Verify it's deleted
      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).toBeNull();
    });

    it('should enforce multi-tenant isolation', async () => {
      const session = await repository.create(createSessionSpec({ accountId: 'acc_alice' }));

      // Try to delete with different account ID
      await repository.delete(session.id, 'acc_bob');

      // Session should still exist
      const loaded = await repository.findById(session.id, 'acc_alice');
      expect(loaded).not.toBeNull();
    });

    it('should not throw when deleting non-existent session', async () => {
      await expect(repository.delete('upl_nonexistent', 'acc_test123')).resolves.not.toThrow();
    });

    it('should not throw when deleting with wrong account', async () => {
      const session = await repository.create(createSessionSpec({ accountId: 'acc_alice' }));

      await expect(repository.delete(session.id, 'acc_bob')).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // cancelAll()
  // ============================================================================

  describe('cancelAll()', () => {
    beforeEach(async () => {
      // Create sessions in various states
      await repository.create(createSessionSpec({ fileName: 'uploading1.json' }));
      await repository.create(createSessionSpec({ fileName: 'uploading2.json' }));

      // Create assembling session
      const assembling = await repository.create(
        createSessionSpec({ fileName: 'assembling.json' })
      );
      for (let i = 0; i < assembling.totalChunks; i++) {
        assembling.recordChunk(i);
      }
      await repository.save(assembling);

      // Create completed session
      const completed = await repository.create(createSessionSpec({ fileName: 'completed.json' }));
      for (let i = 0; i < completed.totalChunks; i++) {
        completed.recordChunk(i);
      }
      completed.markCompleted();
      await repository.save(completed);

      // Create failed session
      const failed = await repository.create(createSessionSpec({ fileName: 'failed.json' }));
      failed.markFailed('Test error');
      await repository.save(failed);
    });

    it('should cancel all in-progress uploads', async () => {
      await repository.cancelAll();

      // Check uploading sessions are now expired
      const sessions = await repository.find({ status: 'expired' });

      expect(sessions.length).toBeGreaterThanOrEqual(3); // 2 uploading + 1 assembling
    });

    it('should set error_message to "Server shutdown"', async () => {
      await repository.cancelAll();

      const sessions = await repository.find({ status: 'expired' });

      expect(sessions.every((s) => s.errorMessage === 'Server shutdown')).toBe(true);
    });

    it('should not affect completed sessions', async () => {
      await repository.cancelAll();

      const completed = await repository.find({ status: 'completed' });

      expect(completed.length).toBe(1);
    });

    it('should not affect failed sessions', async () => {
      await repository.cancelAll();

      const failed = await repository.find({ status: 'failed' });

      expect(failed.length).toBe(1);
      expect(failed[0].errorMessage).toBe('Test error'); // Should keep original error
    });

    it('should update updated_at timestamp', async () => {
      const beforeCancel = Date.now();

      await repository.cancelAll();

      const expired = await repository.find({ status: 'expired' });

      expect(expired.every((s) => s.updatedAt >= beforeCancel)).toBe(true);
    });

    it('should not throw on empty database', async () => {
      // Delete all sessions
      const allSessions = await repository.find({});
      for (const session of allSessions) {
        await repository.delete(session.id, session.accountId);
      }

      await expect(repository.cancelAll()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle very large file sizes (2GB)', async () => {
      const spec = createSessionSpec({
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB
      });

      const session = await repository.create(spec);

      expect(session.totalChunks).toBe(205); // ceil(2GB / 10MB)

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.fileSize).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should handle special characters in file names', async () => {
      const spec = createSessionSpec({
        fileName: 'test file (with) [special] {chars} & \'quotes".json',
      });

      const session = await repository.create(spec);
      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded!.fileName).toBe(spec.fileName);
    });

    it('should handle unicode file names', async () => {
      const spec = createSessionSpec({
        fileName: '测试文件_테스트_ファイル_тест.json',
      });

      const session = await repository.create(spec);
      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded!.fileName).toBe(spec.fileName);
    });

    it('should handle sessions with all chunks received', async () => {
      const session = await repository.create(createSessionSpec());

      // Record all chunks
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      await repository.save(session);
      const loaded = await repository.findById(session.id, session.accountId);

      expect(loaded!.isComplete()).toBe(true);
      expect(loaded!.getMissingChunks()).toEqual([]);
      expect(loaded!.getProgress()).toBe(100);
    });

    it('should handle concurrent saves to same session', async () => {
      const session = await repository.create(createSessionSpec());

      // Simulate concurrent chunk uploads
      await Promise.all([
        (async () => {
          session.recordChunk(0);
          await repository.save(session);
        })(),
        (async () => {
          session.recordChunk(1);
          await repository.save(session);
        })(),
        (async () => {
          session.recordChunk(2);
          await repository.save(session);
        })(),
      ]);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.getProgress()).toBeGreaterThanOrEqual(20); // At least 1 chunk
    });
  });

  // ============================================================================
  // Data Tag Handling
  // ============================================================================

  describe('Data Tag Handling', () => {
    it('should default to "real" data tag', async () => {
      const session = await repository.create(createSessionSpec());

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.dataTag).toBe('real');
    });

    it('should save and load "test" data tag', async () => {
      const session = await repository.create(createSessionSpec());
      session.setDataTag('test');
      await repository.save(session);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.dataTag).toBe('test');
    });
  });
});
