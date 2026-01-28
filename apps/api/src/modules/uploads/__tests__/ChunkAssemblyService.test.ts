/**
 * ChunkAssemblyService Tests
 *
 * Tests for chunk assembly logic - the process of combining uploaded chunks
 * into a complete file after all chunks have been received.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest';
import { ChunkAssemblyService, AssemblyResult } from '../application/ChunkAssemblyService';
import { UploadSession, UploadSessionSpec } from '../domain/UploadSession';
import { UploadSessionRepository } from '../infrastructure/UploadSessionRepository';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Mock repository for testing
class MockUploadSessionRepository implements UploadSessionRepository {
  private sessions: Map<string, UploadSession> = new Map();

  async create(spec: UploadSessionSpec): Promise<UploadSession> {
    const session = UploadSession.create(spec);
    this.sessions.set(session.id, session);
    return session;
  }

  async save(session: UploadSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findById(id: string, accountId: string): Promise<UploadSession | null> {
    const session = this.sessions.get(id);
    if (!session || session.accountId !== accountId) {
      return null;
    }
    return session;
  }

  async find(): Promise<UploadSession[]> {
    return Array.from(this.sessions.values());
  }

  async findExpired(): Promise<UploadSession[]> {
    return [];
  }

  async delete(id: string, accountId: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session && session.accountId === accountId) {
      this.sessions.delete(id);
    }
  }

  async cancelAll(): Promise<void> {
    this.sessions.clear();
  }

  reset() {
    this.sessions.clear();
  }
}

describe('ChunkAssemblyService', () => {
  let repository: MockUploadSessionRepository;
  let service: ChunkAssemblyService;
  let testDir: string;
  let chunksDir: string;

  beforeAll(async () => {
    repository = new MockUploadSessionRepository();
    service = new ChunkAssemblyService(repository);

    // Create test directory
    testDir = join(tmpdir(), `chunk-assembly-test-${randomUUID()}`);
    chunksDir = join(testDir, 'chunks');
    await fs.mkdir(chunksDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    repository.reset();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Create test chunk files with specified content
   */
  async function createTestChunks(
    chunkCount: number,
    chunkSize: number,
    chunksPath: string
  ): Promise<number> {
    await fs.mkdir(chunksPath, { recursive: true });

    let totalBytes = 0;

    for (let i = 0; i < chunkCount; i++) {
      const chunkPath = join(chunksPath, `chunk_${i}`);
      const content = Buffer.alloc(chunkSize, `chunk${i}`);
      await fs.writeFile(chunkPath, content);
      totalBytes += content.length;
    }

    return totalBytes;
  }

  /**
   * Create a test upload session with chunks
   */
  async function createTestSession(options?: {
    chunkCount?: number;
    chunkSize?: number;
    markComplete?: boolean;
  }): Promise<{ session: UploadSession; chunksPath: string; expectedSize: number }> {
    const chunkCount = options?.chunkCount || 5;
    const chunkSize = options?.chunkSize || 1024; // 1KB chunks for testing

    const spec: UploadSessionSpec = {
      accountId: 'acc_test123',
      userId: 'usr_test456',
      jobId: 'job_test789',
      fileName: 'test-file.json',
      fileSize: chunkCount * chunkSize,
      mimeType: 'application/json',
      chunkSize,
    };

    const session = await repository.create(spec);

    // Create chunks directory using session's chunksPath
    const sessionChunksPath = join(chunksDir, session.id);
    await fs.mkdir(sessionChunksPath, { recursive: true });

    // Override session's chunksPath to use our test directory
    (session as any).chunksPath = sessionChunksPath;

    // Create actual chunk files
    const expectedSize = await createTestChunks(chunkCount, chunkSize, sessionChunksPath);

    // Mark chunks as received if requested
    if (options?.markComplete !== false) {
      for (let i = 0; i < chunkCount; i++) {
        session.recordChunk(i);
      }
    }

    await repository.save(session);

    return { session, chunksPath: sessionChunksPath, expectedSize };
  }

  // ============================================================================
  // assembleChunks()
  // ============================================================================

  describe('assembleChunks()', () => {
    it('should assemble chunks into complete file', async () => {
      const { session, expectedSize } = await createTestSession();

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.fileSize).toBe(expectedSize);
      expect(result.errorMessage).toBeUndefined();

      // Verify file exists
      const stats = await fs.stat(result.filePath!);
      expect(stats.size).toBe(expectedSize);
    });

    it('should assemble chunks in correct order', async () => {
      const { session } = await createTestSession({ chunkCount: 3, chunkSize: 10 });

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);

      // Read assembled file
      const content = await fs.readFile(result.filePath!, 'utf-8');

      // Verify chunks are in order (chunk0, chunk1, chunk2)
      expect(content.startsWith('chunk0')).toBe(true);
      expect(content.includes('chunk1')).toBe(true);
      expect(content.includes('chunk2')).toBe(true);
    });

    it('should validate file size matches expected size', async () => {
      const { session, expectedSize } = await createTestSession();

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(expectedSize);
      expect(result.fileSize).toBe(session.fileSize);
    });

    it('should clean up chunk files after successful assembly', async () => {
      const { session, chunksPath } = await createTestSession();

      await service.assembleChunks(session);

      // Verify chunks directory is deleted
      await expect(fs.access(chunksPath)).rejects.toThrow();
    });

    it('should create output file in temp directory', async () => {
      const { session } = await createTestSession();

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('chat-imports');
      expect(result.filePath).toContain(session.id);
      expect(result.filePath).toContain(session.fileName);
    });

    it('should handle single chunk file', async () => {
      const { session, expectedSize } = await createTestSession({ chunkCount: 1, chunkSize: 1024 });

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(expectedSize);
    });

    it('should handle large number of chunks', async () => {
      const { session, expectedSize } = await createTestSession({
        chunkCount: 100,
        chunkSize: 100,
      });

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(expectedSize);
    });

    it('should fail if session is not complete', async () => {
      const { session } = await createTestSession({ markComplete: false });

      // Only mark first 3 chunks as received (out of 5)
      session.recordChunk(0);
      session.recordChunk(1);
      session.recordChunk(2);

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('chunks missing');
    });

    it('should fail if session status is not "assembling"', async () => {
      const { session } = await createTestSession();

      // Mark as failed
      session.markFailed('Test error');

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('session status is');
    });

    it('should fail if chunk file is missing', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete one chunk file
      await fs.unlink(join(chunksPath, 'chunk_2'));

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Chunk file missing');
      expect(result.errorMessage).toContain('chunk_2');
    });

    it('should fail if assembled file size does not match expected', async () => {
      const { session, chunksPath } = await createTestSession({ chunkCount: 5, chunkSize: 100 });

      // Corrupt one chunk file (make it smaller)
      await fs.writeFile(join(chunksPath, 'chunk_2'), Buffer.alloc(50, 'x'));

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('File size mismatch');
    });

    it('should mark session as failed on assembly error', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete chunk file to trigger error
      await fs.unlink(join(chunksPath, 'chunk_0'));

      await service.assembleChunks(session);

      // Reload session
      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('failed');
      expect(loaded!.errorMessage).toBeDefined();
    });

    it('should not clean up chunks on assembly failure', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete one chunk to trigger failure
      await fs.unlink(join(chunksPath, 'chunk_2'));

      await service.assembleChunks(session);

      // Remaining chunks should still exist
      await expect(fs.access(join(chunksPath, 'chunk_0'))).resolves.not.toThrow();
      await expect(fs.access(join(chunksPath, 'chunk_1'))).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // triggerAssembly()
  // ============================================================================

  describe('triggerAssembly()', () => {
    it('should trigger assembly for completed session', async () => {
      const { session, expectedSize } = await createTestSession();

      const result = await service.triggerAssembly(session.id, session.accountId);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(expectedSize);
    });

    it('should mark session as completed after successful assembly', async () => {
      const { session } = await createTestSession();

      await service.triggerAssembly(session.id, session.accountId);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('completed');
      expect(loaded!.completedAt).toBeDefined();
      expect(loaded!.completedAt).toBeGreaterThan(0);
    });

    it('should throw error if session not found', async () => {
      await expect(service.triggerAssembly('upl_nonexistent', 'acc_test123')).rejects.toThrow(
        'Session not found'
      );
    });

    it('should throw error if session is not complete', async () => {
      const { session } = await createTestSession({ markComplete: false });

      // Only mark 3 chunks as received
      session.recordChunk(0);
      session.recordChunk(1);
      session.recordChunk(2);
      await repository.save(session);

      await expect(service.triggerAssembly(session.id, session.accountId)).rejects.toThrow(
        'Session not complete'
      );
    });

    it('should not mark session as completed if assembly fails', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete chunk to trigger failure
      await fs.unlink(join(chunksPath, 'chunk_0'));

      const result = await service.triggerAssembly(session.id, session.accountId);

      expect(result.success).toBe(false);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('failed');
      expect(loaded!.status).not.toBe('completed');
    });

    it('should enforce multi-tenant isolation', async () => {
      const { session } = await createTestSession();

      // Try to trigger assembly with different account ID
      await expect(service.triggerAssembly(session.id, 'acc_different')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  // ============================================================================
  // cancelAssembly()
  // ============================================================================

  describe('cancelAssembly()', () => {
    it('should clean up chunks and delete session', async () => {
      const { session, chunksPath } = await createTestSession();

      await service.cancelAssembly(session.id, session.accountId);

      // Verify chunks directory is deleted
      await expect(fs.access(chunksPath)).rejects.toThrow();

      // Verify session is deleted
      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).toBeNull();
    });

    it('should throw error if session not found', async () => {
      await expect(service.cancelAssembly('upl_nonexistent', 'acc_test123')).rejects.toThrow(
        'Session not found'
      );
    });

    it('should enforce multi-tenant isolation', async () => {
      const { session } = await createTestSession();

      await expect(service.cancelAssembly(session.id, 'acc_different')).rejects.toThrow(
        'Session not found'
      );

      // Verify session still exists
      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).not.toBeNull();
    });

    it('should not throw if chunks directory does not exist', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete chunks directory
      await fs.rm(chunksPath, { recursive: true, force: true });

      await expect(service.cancelAssembly(session.id, session.accountId)).resolves.not.toThrow();

      // Session should still be deleted
      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).toBeNull();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle chunks with different sizes (last chunk smaller)', async () => {
      const { session, chunksPath } = await createTestSession({ chunkCount: 5, chunkSize: 100 });

      // Make last chunk smaller (simulating real upload scenario)
      await fs.writeFile(join(chunksPath, 'chunk_4'), Buffer.alloc(50, 'chunk4'));

      // Update expected file size
      (session as any).fileSize = 100 * 4 + 50; // 4 full chunks + 1 smaller chunk

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(450);
    });

    it('should handle empty chunks directory', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete all chunk files
      const files = await fs.readdir(chunksPath);
      for (const file of files) {
        await fs.unlink(join(chunksPath, file));
      }

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Chunk file missing');
    });

    it('should handle special characters in file names', async () => {
      const spec: UploadSessionSpec = {
        accountId: 'acc_test123',
        userId: 'usr_test456',
        jobId: 'job_test789',
        fileName: 'test (file) [with] {special} chars & quotes.json',
        fileSize: 1024,
        mimeType: 'application/json',
        chunkSize: 1024,
      };

      const session = await repository.create(spec);
      const sessionChunksPath = join(chunksDir, session.id);
      (session as any).chunksPath = sessionChunksPath;

      await createTestChunks(1, 1024, sessionChunksPath);
      session.recordChunk(0);
      await repository.save(session);

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain(spec.fileName);
    });

    it('should handle unicode file names', async () => {
      const spec: UploadSessionSpec = {
        accountId: 'acc_test123',
        userId: 'usr_test456',
        jobId: 'job_test789',
        fileName: '测试文件_테스트_ファイル.json',
        fileSize: 1024,
        mimeType: 'application/json',
        chunkSize: 1024,
      };

      const session = await repository.create(spec);
      const sessionChunksPath = join(chunksDir, session.id);
      (session as any).chunksPath = sessionChunksPath;

      await createTestChunks(1, 1024, sessionChunksPath);
      session.recordChunk(0);
      await repository.save(session);

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain(spec.fileName);
    });

    it('should handle very small files (single byte)', async () => {
      const spec: UploadSessionSpec = {
        accountId: 'acc_test123',
        userId: 'usr_test456',
        jobId: 'job_test789',
        fileName: 'tiny.json',
        fileSize: 1,
        mimeType: 'application/json',
        chunkSize: 10 * 1024 * 1024,
      };

      const session = await repository.create(spec);
      const sessionChunksPath = join(chunksDir, session.id);
      (session as any).chunksPath = sessionChunksPath;

      await fs.mkdir(sessionChunksPath, { recursive: true });
      await fs.writeFile(join(sessionChunksPath, 'chunk_0'), Buffer.from('x'));

      session.recordChunk(0);
      await repository.save(session);

      const result = await service.assembleChunks(session);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(1);
    });

    it('should handle concurrent assembly attempts gracefully', async () => {
      const { session } = await createTestSession();

      // Trigger assembly concurrently
      const results = await Promise.allSettled([
        service.triggerAssembly(session.id, session.accountId),
        service.triggerAssembly(session.id, session.accountId),
      ]);

      // At least one should succeed
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && (r.value as AssemblyResult).success
      ).length;

      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Error Recovery
  // ============================================================================

  describe('Error Recovery', () => {
    it('should preserve error message in session on failure', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete chunk to trigger error
      await fs.unlink(join(chunksPath, 'chunk_0'));

      await service.assembleChunks(session);

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded!.status).toBe('failed');
      expect(loaded!.errorMessage).toBeDefined();
      expect(loaded!.errorMessage).toContain('Chunk file missing');
    });

    it('should allow retry after failed assembly', async () => {
      const { session, chunksPath } = await createTestSession();

      // Delete chunk to trigger initial failure
      await fs.unlink(join(chunksPath, 'chunk_2'));

      const firstResult = await service.assembleChunks(session);
      expect(firstResult.success).toBe(false);

      // Restore missing chunk
      await fs.writeFile(join(chunksPath, 'chunk_2'), Buffer.alloc(1024, 'chunk2'));

      // Reset session status to assembling for retry
      (session as any).status = 'assembling';
      (session as any).errorMessage = null;

      const secondResult = await service.assembleChunks(session);
      expect(secondResult.success).toBe(true);
    });
  });
});
