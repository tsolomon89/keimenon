/**
 * Upload Routes Integration Tests
 *
 * Tests for the chunked upload HTTP API endpoints.
 * Validates request/response handling, authentication, multi-tenant isolation,
 * and integration with the upload domain layer.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createUploadRoutes } from '../uploads.routes';
import { AuthService } from '../../services/auth.service';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';

// ============================================================================
// Test Setup
// ============================================================================

describe('Upload Routes (Integration)', () => {
  let app: Express;
  let db: Database.Database;
  let authService: AuthService;
  let testDir: string;
  let authToken: string;
  let accountId: string;
  let userId: string;

  beforeAll(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        job_id TEXT,
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
        data_tag TEXT NOT NULL DEFAULT 'real',
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        account_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        state_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        idempotency_key TEXT,
        concurrency_group TEXT,
        data_tag TEXT NOT NULL DEFAULT 'real'
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        account_id TEXT NOT NULL
      );
    `);

    // Insert test account and user
    accountId = 'acc_test123';
    userId = 'usr_test456';

    db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run(accountId, 'Test Account');

    db.prepare('INSERT INTO users (id, email, password_hash, account_id) VALUES (?, ?, ?, ?)').run(
      userId,
      'test@example.com',
      'hashed_password',
      accountId
    );

    // Create test directory
    testDir = join(tmpdir(), `upload-routes-test-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Initialize auth service (mock)
    authService = {
      verifyToken: async (token: string) => {
        if (token === 'valid_token') {
          return {
            userId,
            accountId,
            email: 'test@example.com',
          };
        }
        throw new Error('Invalid token');
      },
    } as any;

    // Set up Express app
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

    // Backward-compatible test shim:
    // route now requires `importConfig` object for initiate requests.
    app.use((req, _res, next) => {
      if (
        req.method === 'POST' &&
        req.path === '/api/v1/uploads/initiate' &&
        req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body) &&
        !('importConfig' in req.body)
      ) {
        (req.body as any).importConfig = {};
      }
      next();
    });

    // Mock getDbClient middleware
    app.use((req, res, next) => {
      (req as any).db = { db };
      next();
    });

    // Mount upload routes
    const uploadRoutes = createUploadRoutes(authService);
    app.use('/api/v1/uploads', uploadRoutes);

    authToken = 'valid_token';
  });

  afterAll(async () => {
    db.close();

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up upload sessions before each test
    db.prepare('DELETE FROM upload_sessions').run();
  });

  // ============================================================================
  // POST /initiate
  // ============================================================================

  describe('POST /initiate', () => {
    it('should create a new upload session', async () => {
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 50 * 1024 * 1024, // 50MB
          mimeType: 'application/json',
          chunkSize: 10 * 1024 * 1024, // 10MB
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeDefined();
      expect(response.body.data.session.id).toMatch(/^upl_/);
      expect(response.body.data.session.fileName).toBe('test-file.json');
      expect(response.body.data.session.fileSize).toBe(50 * 1024 * 1024);
      expect(response.body.data.session.totalChunks).toBe(5);
      expect(response.body.data.jobId).toBeDefined();
    });

    it('should use default chunk size if not specified', async () => {
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 50 * 1024 * 1024,
          mimeType: 'application/json',
        })
        .expect(201);

      expect(response.body.data.session.chunkSize).toBe(10 * 1024 * 1024); // Default 10MB
    });

    it('should save session to database', async () => {
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 10 * 1024 * 1024,
          mimeType: 'application/json',
        })
        .expect(201);

      const sessionId = response.body.data.session.id;

      // Verify in database
      const row = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      expect(row).toBeDefined();
      expect((row as any).file_name).toBe('test-file.json');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .send({
          fileName: 'test-file.json',
          fileSize: 1024,
        })
        .expect(401);
    });

    it('should reject invalid authentication token', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', 'Bearer invalid_token')
        .send({
          fileName: 'test-file.json',
          fileSize: 1024,
        })
        .expect(401);
    });

    it('should validate request body - missing fileName', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileSize: 1024,
        })
        .expect(400);
    });

    it('should validate request body - missing fileSize', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test.json',
        })
        .expect(400);
    });

    it('should validate request body - invalid fileSize (negative)', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test.json',
          fileSize: -1,
        })
        .expect(400);
    });

    it('should validate request body - invalid fileSize (zero)', async () => {
      await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test.json',
          fileSize: 0,
        })
        .expect(400);
    });

    it('should accept optional jobId', async () => {
      const customJobId = 'job_custom_123';

      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test.json',
          fileSize: 1024,
          jobId: customJobId,
        })
        .expect(201);

      expect(response.body.data.jobId).toBe(customJobId);
    });

    it('should isolate sessions by account_id', async () => {
      // Create session
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test.json',
          fileSize: 1024,
        })
        .expect(201);

      // Verify session has correct account_id
      const row = db
        .prepare('SELECT * FROM upload_sessions WHERE id = ?')
        .get(response.body.data.session.id);

      expect((row as any).account_id).toBe(accountId);
    });
  });

  // ============================================================================
  // POST /:sessionId/chunks/:chunkIndex
  // ============================================================================

  describe('POST /:sessionId/chunks/:chunkIndex', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create session for testing
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 5 * 1024, // 5KB (5 chunks of 1KB each)
          mimeType: 'application/json',
          chunkSize: 1024, // 1KB chunks
        });

      sessionId = response.body.data.session.id;

      // Create chunks directory
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      await fs.mkdir((session as any).chunks_path, { recursive: true });
    });

    it('should upload chunk successfully', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      const response = await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.chunkIndex).toBe(0);
      expect(response.body.data.chunksReceived).toBe(1);
      expect(response.body.data.totalChunks).toBe(5);
      expect(response.body.data.progress).toBe(20); // 1/5 = 20%
      expect(response.body.data.isComplete).toBe(false);
    });

    it('should save chunk to disk', async () => {
      const chunkData = Buffer.alloc(1024, 'test data');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      // Verify chunk file exists
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      const chunkPath = join((session as any).chunks_path, 'chunk_0');

      await expect(fs.access(chunkPath)).resolves.not.toThrow();

      // Verify content
      const savedData = await fs.readFile(chunkPath);
      expect(savedData.length).toBe(1024);
    });

    it('should update session progress in database', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      // Check database
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      const chunksReceived = JSON.parse((session as any).chunks_received);

      expect(chunksReceived).toEqual({ 0: 1 });
    });

    it('should allow uploading chunks out of order', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      // Upload chunk 2 first
      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/2`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      // Then upload chunk 0
      const response = await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      expect(response.body.data.chunksReceived).toBe(2);
    });

    it('should mark session as "assembling" when all chunks received', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      // Upload first 4 chunks
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`/api/v1/uploads/${sessionId}/chunks/${i}`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/octet-stream')
          .send(chunkData);
      }

      // Upload final chunk and check completion response
      const response = await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/4`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      expect(response.body.data.isComplete).toBe(true);
      expect(response.body.data.progress).toBe(100);

      // Check database
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async update

      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      expect((session as any).status).toBe('completed');
    });

    it('should reject invalid chunk index (negative)', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/-1`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(400);
    });

    it('should reject invalid chunk index (too large)', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/10`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(400);
    });

    it('should require authentication', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(401);
    });

    it('should enforce multi-tenant isolation', async () => {
      // Create session for different account
      const otherAccountId = 'acc_other';
      db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run(otherAccountId, 'Other');

      db.prepare(
        'INSERT INTO upload_sessions (id, account_id, user_id, job_id, file_name, file_size, mime_type, chunk_size, total_chunks, chunks_received, chunks_path, status, created_at, updated_at, expires_at, is_local, data_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'upl_other',
        otherAccountId,
        'usr_other',
        'job_other',
        'other.json',
        1024,
        'application/json',
        1024,
        1,
        '{}',
        '/tmp/chunks/upl_other',
        'uploading',
        Date.now(),
        Date.now(),
        Date.now() + 3600000,
        1,
        'real'
      );

      const chunkData = Buffer.alloc(1024, 'x');

      // Try to upload chunk to other account's session
      await request(app)
        .post('/api/v1/uploads/upl_other/chunks/0')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(404); // Should not find session from different account
    });

    it('should reject upload to expired session', async () => {
      // Manually expire session
      db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?').run(
        Date.now() - 1000,
        sessionId
      );

      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(410);
    });

    it('should allow duplicate chunk uploads (idempotent)', async () => {
      const chunkData = Buffer.alloc(1024, 'x');

      // Upload chunk 0 twice
      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      const response = await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .expect(200);

      // Should still show 1 chunk received
      expect(response.body.data.chunksReceived).toBe(1);
    });
  });

  // ============================================================================
  // GET /:sessionId
  // ============================================================================

  describe('GET /:sessionId', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 5 * 1024,
          chunkSize: 1024,
        });

      sessionId = response.body.data.session.id;
    });

    it('should return session status', async () => {
      const response = await request(app)
        .get(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeDefined();
      expect(response.body.data.session.id).toBe(sessionId);
      expect(response.body.data.session.fileName).toBe('test-file.json');
      expect(response.body.data.session.totalChunks).toBe(5);
      expect(response.body.data.session.chunksReceived).toBe(0);
      expect(response.body.data.session.missingChunks).toEqual([0, 1, 2, 3, 4]);
      expect(response.body.data.session.progress).toBe(0);
    });

    it('should return updated progress after chunk uploads', async () => {
      // Upload 2 chunks
      const chunkData = Buffer.alloc(1024, 'x');

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData);

      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/2`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData);

      const response = await request(app)
        .get(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.session.chunksReceived).toBe(2);
      expect(response.body.data.session.missingChunks).toEqual([1, 3, 4]);
      expect(response.body.data.session.progress).toBe(40); // 2/5 = 40%
    });

    it('should require authentication', async () => {
      await request(app).get(`/api/v1/uploads/${sessionId}`).expect(401);
    });

    it('should enforce multi-tenant isolation', async () => {
      // Create session for different account
      const otherAccountId = 'acc_other2';
      db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run(otherAccountId, 'Other2');

      db.prepare(
        'INSERT INTO upload_sessions (id, account_id, user_id, job_id, file_name, file_size, mime_type, chunk_size, total_chunks, chunks_received, chunks_path, status, created_at, updated_at, expires_at, is_local, data_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'upl_other2',
        otherAccountId,
        'usr_other2',
        'job_other2',
        'other.json',
        1024,
        'application/json',
        1024,
        1,
        '{}',
        '/tmp/chunks/upl_other2',
        'uploading',
        Date.now(),
        Date.now(),
        Date.now() + 3600000,
        1,
        'real'
      );

      await request(app)
        .get('/api/v1/uploads/upl_other2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent session', async () => {
      await request(app)
        .get('/api/v1/uploads/upl_nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for removed legacy progress endpoint', async () => {
      await request(app)
        .get('/api/v1/uploads/upl_nonexistent/progress')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ============================================================================
  // DELETE /:sessionId
  // ============================================================================

  describe('DELETE /:sessionId', () => {
    let sessionId: string;
    let chunksPath: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'test-file.json',
          fileSize: 2 * 1024,
          chunkSize: 1024,
        });

      sessionId = response.body.data.session.id;

      // Get chunks path
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      chunksPath = (session as any).chunks_path;

      // Create chunks directory
      await fs.mkdir(chunksPath, { recursive: true });

      // Upload a chunk
      const chunkData = Buffer.alloc(1024, 'x');
      await request(app)
        .post(`/api/v1/uploads/${sessionId}/chunks/0`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData);
    });

    it('should cancel upload session', async () => {
      const response = await request(app)
        .delete(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('cancelled');
    });

    it('should delete session from database', async () => {
      await request(app)
        .delete(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify session is deleted
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
      expect(session).toBeUndefined();
    });

    it('should delete chunk files', async () => {
      await request(app)
        .delete(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Wait for async file deletion
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify chunks directory is deleted
      await expect(fs.access(chunksPath)).rejects.toThrow();
    });

    it('should require authentication', async () => {
      await request(app).delete(`/api/v1/uploads/${sessionId}`).expect(401);
    });

    it('should enforce multi-tenant isolation', async () => {
      // Create session for different account
      const otherAccountId = 'acc_other3';
      db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run(otherAccountId, 'Other3');

      db.prepare(
        'INSERT INTO upload_sessions (id, account_id, user_id, job_id, file_name, file_size, mime_type, chunk_size, total_chunks, chunks_received, chunks_path, status, created_at, updated_at, expires_at, is_local, data_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'upl_other3',
        otherAccountId,
        'usr_other3',
        'job_other3',
        'other.json',
        1024,
        'application/json',
        1024,
        1,
        '{}',
        '/tmp/chunks/upl_other3',
        'uploading',
        Date.now(),
        Date.now(),
        Date.now() + 3600000,
        1,
        'real'
      );

      await request(app)
        .delete('/api/v1/uploads/upl_other3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Verify session still exists
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get('upl_other3');
      expect(session).toBeDefined();
    });

    it('should return 404 for non-existent session', async () => {
      await request(app)
        .delete('/api/v1/uploads/upl_nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not throw if chunk files already deleted', async () => {
      // Delete chunk files manually
      await fs.rm(chunksPath, { recursive: true, force: true });

      await request(app)
        .delete(`/api/v1/uploads/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
