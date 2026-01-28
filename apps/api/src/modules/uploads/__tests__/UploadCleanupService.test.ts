/**
 * UploadCleanupService Tests
 *
 * Tests for the background cleanup service that removes expired upload sessions.
 * Validates cleanup logic, scheduling, statistics, and error handling.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest';
import {
  UploadCleanupService,
  CleanupStats,
  initializeCleanupService,
  getCleanupService,
  shutdownCleanupService,
} from '../application/UploadCleanupService';
import { UploadSession, UploadSessionSpec } from '../domain/UploadSession';
import { UploadSessionRepository } from '../infrastructure/UploadSessionRepository';
import { promises as fs } from 'fs';
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
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      (s) => s.expiresAt < now && (s.status === 'uploading' || s.status === 'assembling')
    );
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

describe('UploadCleanupService', () => {
  let repository: MockUploadSessionRepository;
  let service: UploadCleanupService;
  let testDir: string;

  beforeAll(async () => {
    repository = new MockUploadSessionRepository();

    // Create test directory
    testDir = join(tmpdir(), `cleanup-test-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Stop service if running
    if (service) {
      service.stop();
    }

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

  async function createExpiredSession(options?: {
    accountId?: string;
    fileName?: string;
    withChunkFiles?: boolean;
  }): Promise<UploadSession> {
    const spec: UploadSessionSpec = {
      accountId: options?.accountId || 'acc_test123',
      userId: 'usr_test456',
      jobId: 'job_test789',
      fileName: options?.fileName || 'expired.json',
      fileSize: 1024,
      mimeType: 'application/json',
      chunkSize: 1024,
    };

    const session = await repository.create(spec);

    // Override chunksPath to use test directory
    const chunksPath = join(testDir, session.id);
    (session as any).chunksPath = chunksPath;

    // Create chunk files if requested
    if (options?.withChunkFiles) {
      await fs.mkdir(chunksPath, { recursive: true });
      await fs.writeFile(join(chunksPath, 'chunk_0'), Buffer.alloc(512, 'x'));
      await fs.writeFile(join(chunksPath, 'chunk_1'), Buffer.alloc(512, 'y'));
    }

    // Manually expire the session
    // NOTE: accessing private property _expiresAt via casting to any
    // because expiresAt is a getter and setting it on the instance doesn't update the backing field
    (session as any)._expiresAt = Date.now() - 1000; // 1 second ago

    await repository.save(session);

    return session;
  }

  async function createNonExpiredSession(): Promise<UploadSession> {
    const spec: UploadSessionSpec = {
      accountId: 'acc_test123',
      userId: 'usr_test456',
      jobId: 'job_test789',
      fileName: 'active.json',
      fileSize: 1024,
      mimeType: 'application/json',
      chunkSize: 1024,
    };

    return repository.create(spec);
  }

  // ============================================================================
  // Constructor and Configuration
  // ============================================================================

  describe('Constructor', () => {
    it('should create service with default interval (1 hour)', () => {
      service = new UploadCleanupService(repository);

      const status = service.getStatus();
      expect(status.intervalMs).toBe(60 * 60 * 1000); // 1 hour
      expect(status.isRunning).toBe(false);
    });

    it('should create service with custom interval', () => {
      service = new UploadCleanupService(repository, 30 * 60 * 1000); // 30 minutes

      const status = service.getStatus();
      expect(status.intervalMs).toBe(30 * 60 * 1000);
    });
  });

  // ============================================================================
  // start() and stop()
  // ============================================================================

  describe('start() and stop()', () => {
    it('should start the cleanup service', async () => {
      service = new UploadCleanupService(repository, 1000);

      service.start();

      const status = service.getStatus();
      expect(status.isRunning).toBe(true);

      // Wait a bit to let initial cleanup run
      await new Promise((resolve) => setTimeout(resolve, 100));

      service.stop();
    });

    it('should stop the cleanup service', () => {
      service = new UploadCleanupService(repository, 1000);

      service.start();
      expect(service.getStatus().isRunning).toBe(true);

      service.stop();
      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should not start if already running', () => {
      service = new UploadCleanupService(repository, 1000);

      service.start();
      const consoleSpy = vi.spyOn(console, 'log');

      service.start(); // Try to start again

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Service already running'));

      service.stop();
      consoleSpy.mockRestore();
    });

    it('should not stop if not running', () => {
      service = new UploadCleanupService(repository, 1000);

      const consoleSpy = vi.spyOn(console, 'log');

      service.stop(); // Try to stop without starting

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Service not running'));

      consoleSpy.mockRestore();
    });

    it('should run cleanup immediately on start', async () => {
      await createExpiredSession();

      service = new UploadCleanupService(repository, 60000); // 1 minute interval

      const cleanupSpy = vi.spyOn(service, 'runCleanup');

      service.start();

      // Wait for initial cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cleanupSpy).toHaveBeenCalled();

      service.stop();
      cleanupSpy.mockRestore();
    });

    it('should run cleanup on interval', async () => {
      service = new UploadCleanupService(repository, 100); // 100ms interval

      const cleanupSpy = vi.spyOn(service, 'runCleanup');

      service.start();

      // Wait for multiple intervals
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(cleanupSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

      service.stop();
      cleanupSpy.mockRestore();
    });
  });

  // ============================================================================
  // runCleanup()
  // ============================================================================

  describe('runCleanup()', () => {
    beforeEach(() => {
      service = new UploadCleanupService(repository, 60000);
    });

    it('should return zero stats when no expired sessions', async () => {
      await createNonExpiredSession();

      const stats = await service.runCleanup();

      expect(stats.sessionsFound).toBe(0);
      expect(stats.sessionsExpired).toBe(0);
      expect(stats.sessionsDeleted).toBe(0);
      expect(stats.chunkFilesDeleted).toBe(0);
      expect(stats.diskSpaceFreed).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should clean up expired sessions', async () => {
      await createExpiredSession({ withChunkFiles: true });
      await createExpiredSession({ withChunkFiles: true });

      const stats = await service.runCleanup();

      expect(stats.sessionsFound).toBe(2);
      expect(stats.sessionsExpired).toBe(2);
      expect(stats.sessionsDeleted).toBe(2);
    });

    it('should mark sessions as expired', async () => {
      const session = await createExpiredSession();

      await service.runCleanup();

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).toBeNull(); // Should be deleted after cleanup
    });

    it('should delete chunk files', async () => {
      const session = await createExpiredSession({ withChunkFiles: true });
      const chunksPath = (session as any).chunksPath;

      // Verify chunks exist before cleanup
      await expect(fs.access(chunksPath)).resolves.not.toThrow();

      await service.runCleanup();

      // Verify chunks are deleted after cleanup
      await expect(fs.access(chunksPath)).rejects.toThrow();
    });

    it('should calculate disk space freed', async () => {
      await createExpiredSession({ withChunkFiles: true });

      const stats = await service.runCleanup();

      expect(stats.diskSpaceFreed).toBeGreaterThan(0);
      expect(stats.diskSpaceFreed).toBe(1024); // 512 + 512 bytes
    });

    it('should count chunk files deleted', async () => {
      const session = await createExpiredSession({ withChunkFiles: true });

      const stats = await service.runCleanup();

      expect(stats.chunkFilesDeleted).toBe(2); // chunk_0 + chunk_1
    });

    it('should delete sessions from database', async () => {
      const session = await createExpiredSession();

      await service.runCleanup();

      const loaded = await repository.findById(session.id, session.accountId);
      expect(loaded).toBeNull();
    });

    it('should handle sessions without chunk files', async () => {
      await createExpiredSession({ withChunkFiles: false });

      const stats = await service.runCleanup();

      expect(stats.sessionsFound).toBe(1);
      expect(stats.sessionsDeleted).toBe(1);
      expect(stats.chunkFilesDeleted).toBe(0);
      expect(stats.diskSpaceFreed).toBe(0);
    });

    it('should handle multiple expired sessions', async () => {
      for (let i = 0; i < 5; i++) {
        await createExpiredSession({
          fileName: `file_${i}.json`,
          withChunkFiles: true,
        });
      }

      const stats = await service.runCleanup();

      expect(stats.sessionsFound).toBe(5);
      expect(stats.sessionsDeleted).toBe(5);
    });

    it('should not delete non-expired sessions', async () => {
      const activeSession = await createNonExpiredSession();
      await createExpiredSession();

      await service.runCleanup();

      // Active session should still exist
      const loaded = await repository.findById(activeSession.id, activeSession.accountId);
      expect(loaded).not.toBeNull();
    });

    it('should handle cleanup errors gracefully', async () => {
      const session = await createExpiredSession({ withChunkFiles: true });

      // Spy on fs.unlink to throw error for this session's chunks
      const unlinkSpy = vi
        .spyOn(fs, 'unlink')
        .mockRejectedValueOnce(new Error('Permission denied'));

      const stats = await service.runCleanup();

      // Should still report session as found
      expect(stats.sessionsFound).toBe(1);
      // And should report error
      expect(stats.errors).toBe(1);

      unlinkSpy.mockRestore();
    });

    it('should continue cleanup even if one session fails', async () => {
      await createExpiredSession({ withChunkFiles: true });
      const failingSession = await createExpiredSession({ withChunkFiles: true });
      await createExpiredSession({ withChunkFiles: true });

      // Mock cleanupChunkFiles on the service instance
      // We spy on the method to make it throw for one session
      // Note: testing private method via casting
      const cleanupSpy = vi
        .spyOn(service as any, 'cleanupChunkFiles')
        .mockImplementation(async (session: any) => {
          if (session.id === failingSession.id) {
            throw new Error('Cleanup failed');
          }
          // For others, return success (we simulate success without actual FS ops if we want,
          // but here we are mocking the whole method, so no FS ops happen for others either.
          // We can just return success stats.)
          return { freedBytes: 100, filesDeleted: 1 };
        });

      const stats = await service.runCleanup();

      expect(stats.sessionsFound).toBe(3);
      // Should clean up other sessions even if one fails
      expect(stats.sessionsDeleted).toBe(2);
      expect(stats.errors).toBe(1);

      cleanupSpy.mockRestore();
    });

    it('should log cleanup statistics', async () => {
      await createExpiredSession({ withChunkFiles: true });

      const consoleSpy = vi.spyOn(console, 'log');

      await service.runCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleanup complete'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Sessions found'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Disk space freed'));

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // triggerManualCleanup()
  // ============================================================================

  describe('triggerManualCleanup()', () => {
    beforeEach(() => {
      service = new UploadCleanupService(repository, 60000);
    });

    it('should trigger manual cleanup', async () => {
      await createExpiredSession({ withChunkFiles: true });

      const stats = await service.triggerManualCleanup();

      expect(stats.sessionsFound).toBe(1);
      expect(stats.sessionsDeleted).toBe(1);
    });

    it('should work without starting the service', async () => {
      await createExpiredSession({ withChunkFiles: true });

      // Don't call start()
      const stats = await service.triggerManualCleanup();

      expect(stats.sessionsFound).toBe(1);
      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should log manual cleanup trigger', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await service.triggerManualCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Manual cleanup triggered'));

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // getStatus()
  // ============================================================================

  describe('getStatus()', () => {
    it('should return current status', () => {
      service = new UploadCleanupService(repository, 30000);

      const status = service.getStatus();

      expect(status).toEqual({
        isRunning: false,
        intervalMs: 30000,
      });
    });

    it('should reflect running state', () => {
      service = new UploadCleanupService(repository, 1000);

      service.start();
      expect(service.getStatus().isRunning).toBe(true);

      service.stop();
      expect(service.getStatus().isRunning).toBe(false);
    });
  });

  // ============================================================================
  // Singleton Functions
  // ============================================================================

  describe('Singleton Functions', () => {
    it('should initialize cleanup service singleton', () => {
      const instance = initializeCleanupService(repository);

      expect(instance).toBeInstanceOf(UploadCleanupService);
      expect(instance.getStatus().isRunning).toBe(true);

      const retrieved = getCleanupService();
      expect(retrieved).toBe(instance);

      shutdownCleanupService();
      expect(instance.getStatus().isRunning).toBe(false);
      expect(getCleanupService()).toBeNull();
    });

    it('should warn if already initialized', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      initializeCleanupService(repository);
      initializeCleanupService(repository); // Try to initialize again

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Service already initialized')
      );

      shutdownCleanupService();
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      service = new UploadCleanupService(repository, 60000);
    });

    it('should handle sessions with special characters in paths', async () => {
      const session = await createExpiredSession({
        fileName: 'file (with) [special] chars.json',
        withChunkFiles: true,
      });

      const stats = await service.runCleanup();

      expect(stats.sessionsDeleted).toBe(1);
    });

    it('should handle sessions with unicode file names', async () => {
      const session = await createExpiredSession({
        fileName: '测试文件_테스트_ファイル.json',
        withChunkFiles: true,
      });

      const stats = await service.runCleanup();

      expect(stats.sessionsDeleted).toBe(1);
    });

    it('should handle empty chunks directory', async () => {
      const session = await createExpiredSession({ withChunkFiles: true });
      const chunksPath = (session as any).chunksPath;

      // Delete all chunk files but leave directory
      const files = await fs.readdir(chunksPath);
      for (const file of files) {
        await fs.unlink(join(chunksPath, file));
      }

      const stats = await service.runCleanup();

      expect(stats.sessionsDeleted).toBe(1);
      expect(stats.chunkFilesDeleted).toBe(0);
    });

    it('should handle very large number of expired sessions', async () => {
      // Create 150 expired sessions
      for (let i = 0; i < 150; i++) {
        await createExpiredSession({
          fileName: `file_${i}.json`,
          accountId: `acc_${i}`,
        });
      }

      const stats = await service.runCleanup();

      // Should handle all 150 (or at least 100 if repository limits)
      expect(stats.sessionsFound).toBeGreaterThanOrEqual(100);
    });

    it('should calculate disk space correctly for large files', async () => {
      const session = await createExpiredSession({ withChunkFiles: false });
      const chunksPath = (session as any).chunksPath;

      // Create large chunk files (1MB each)
      await fs.mkdir(chunksPath, { recursive: true });
      await fs.writeFile(join(chunksPath, 'chunk_0'), Buffer.alloc(1024 * 1024, 'x'));
      await fs.writeFile(join(chunksPath, 'chunk_1'), Buffer.alloc(1024 * 1024, 'y'));

      const stats = await service.runCleanup();

      expect(stats.diskSpaceFreed).toBe(2 * 1024 * 1024);
    });

    it('should handle concurrent cleanup runs', async () => {
      await createExpiredSession({ withChunkFiles: true });

      // Run cleanup concurrently
      const results = await Promise.allSettled([service.runCleanup(), service.runCleanup()]);

      // Both should complete without errors
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    });
  });

  // ============================================================================
  // Performance
  // ============================================================================

  describe('Performance', () => {
    beforeEach(() => {
      service = new UploadCleanupService(repository, 60000);
    });

    it('should complete cleanup in reasonable time', async () => {
      // Create 10 expired sessions
      for (let i = 0; i < 10; i++) {
        await createExpiredSession({
          fileName: `file_${i}.json`,
          withChunkFiles: true,
        });
      }

      const startTime = Date.now();
      await service.runCleanup();
      const duration = Date.now() - startTime;

      // Should complete in less than 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});
