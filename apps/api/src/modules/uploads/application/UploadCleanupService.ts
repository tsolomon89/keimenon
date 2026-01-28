/**
 * Upload Cleanup Service
 *
 * Background service that runs periodically to clean up expired upload sessions.
 * Prevents disk space accumulation from abandoned uploads.
 *
 * Responsibilities:
 * - Find expired upload sessions
 * - Clean up chunk files from disk
 * - Delete expired sessions from database
 * - Mark sessions as expired (with reason)
 * - Log cleanup statistics
 *
 * Schedule: Runs every hour by default
 *
 * Related: Chunked Upload System - Phase 6
 */

import { UploadSessionRepository } from '../infrastructure/UploadSessionRepository';
import { UploadSession } from '../domain/UploadSession';
import { promises as fs } from 'fs';

export interface CleanupStats {
  sessionsFound: number;
  sessionsExpired: number;
  sessionsDeleted: number;
  chunkFilesDeleted: number;
  diskSpaceFreed: number; // bytes
  errors: number;
}

/**
 * Upload Cleanup Service
 */
export class UploadCleanupService {
  private isRunning = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private uploadRepo: UploadSessionRepository,
    private cleanupIntervalMs: number = 60 * 60 * 1000 // Default: 1 hour
  ) {}

  /**
   * Start the cleanup service (runs on interval)
   */
  start(): void {
    if (this.isRunning) {
      console.log('[UploadCleanup] ⚠️  Service already running');
      return;
    }

    console.log(
      `[UploadCleanup] 🚀 Starting cleanup service (interval: ${this.cleanupIntervalMs / 1000}s)`
    );

    this.isRunning = true;

    // Run immediately on start
    this.runCleanup().catch((error) => {
      console.error('[UploadCleanup] ❌ Initial cleanup failed:', error);
    });

    // Schedule periodic cleanup
    this.intervalHandle = setInterval(() => {
      this.runCleanup().catch((error) => {
        console.error('[UploadCleanup] ❌ Scheduled cleanup failed:', error);
      });
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[UploadCleanup] ⚠️  Service not running');
      return;
    }

    console.log('[UploadCleanup] 🛑 Stopping cleanup service');

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.isRunning = false;
  }

  /**
   * Run cleanup once (can be called manually)
   */
  async runCleanup(): Promise<CleanupStats> {
    const startTime = Date.now();
    const stats: CleanupStats = {
      sessionsFound: 0,
      sessionsExpired: 0,
      sessionsDeleted: 0,
      chunkFilesDeleted: 0,
      diskSpaceFreed: 0,
      errors: 0,
    };

    console.log('[UploadCleanup] 🧹 Starting cleanup run...');

    try {
      // Step 1: Find expired sessions
      const expiredSessions = await this.uploadRepo.findExpired();
      stats.sessionsFound = expiredSessions.length;

      if (expiredSessions.length === 0) {
        console.log('[UploadCleanup] ✅ No expired sessions found');
        return stats;
      }

      console.log(`[UploadCleanup] Found ${expiredSessions.length} expired sessions`);

      // Step 2: Process each expired session
      for (const session of expiredSessions) {
        try {
          await this.cleanupSession(session, stats);
        } catch (error: any) {
          console.error(
            `[UploadCleanup] ❌ Failed to cleanup session ${session.id}:`,
            error.message
          );
          stats.errors++;
        }
      }

      // Step 3: Log summary
      const duration = Date.now() - startTime;
      const diskSpaceFreedMB = (stats.diskSpaceFreed / 1024 / 1024).toFixed(2);

      console.log('[UploadCleanup] ✅ Cleanup complete');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Sessions found: ${stats.sessionsFound}`);
      console.log(`   Sessions expired: ${stats.sessionsExpired}`);
      console.log(`   Sessions deleted: ${stats.sessionsDeleted}`);
      console.log(`   Chunk files deleted: ${stats.chunkFilesDeleted}`);
      console.log(`   Disk space freed: ${diskSpaceFreedMB} MB`);
      console.log(`   Errors: ${stats.errors}`);

      return stats;
    } catch (error: any) {
      console.error('[UploadCleanup] ❌ Cleanup run failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup a single expired session
   */
  private async cleanupSession(session: UploadSession, stats: CleanupStats): Promise<void> {
    console.log(`[UploadCleanup] Cleaning session ${session.id} (${session.fileName})`);

    // Step 1: Mark session as expired (if not already)
    if (session.status !== 'expired') {
      session.expire();
      await this.uploadRepo.save(session);
      stats.sessionsExpired++;
      console.log(`   Marked as expired`);
    }

    // Step 2: Clean up chunk files
    const { freedBytes, filesDeleted } = await this.cleanupChunkFiles(session);
    stats.diskSpaceFreed += freedBytes;
    stats.chunkFilesDeleted += filesDeleted;

    // Step 3: Delete session from database
    await this.uploadRepo.delete(session.id, session.accountId);
    stats.sessionsDeleted++;
    console.log(`   Deleted from database`);
  }

  /**
   * Clean up chunk files for a session
   * Returns stats about cleanup
   */
  private async cleanupChunkFiles(
    session: UploadSession
  ): Promise<{ freedBytes: number; filesDeleted: number }> {
    let diskSpaceFreed = 0;
    let filesDeleted = 0;

    try {
      // Check if chunks directory exists
      try {
        await fs.access(session.chunksPath);
      } catch {
        // Directory doesn't exist, nothing to clean up
        return { freedBytes: 0, filesDeleted: 0 };
      }

      // Get list of chunk files
      const files = await fs.readdir(session.chunksPath);

      // Delete each chunk file
      for (const file of files) {
        try {
          const filePath = `${session.chunksPath}/${file}`;
          const stats = await fs.stat(filePath);
          await fs.unlink(filePath);

          diskSpaceFreed += stats.size;
          filesDeleted++;
        } catch (error) {
          console.warn(`   Failed to delete chunk file ${file}:`, error);
        }
      }

      // Delete chunks directory
      try {
        await fs.rmdir(session.chunksPath);
      } catch (error) {
        console.warn(`   Failed to delete chunks directory:`, error);
      }

      console.log(
        `   Deleted ${filesDeleted} chunk files (${(diskSpaceFreed / 1024 / 1024).toFixed(2)} MB)`
      );
    } catch (error: any) {
      console.warn(`   Failed to cleanup chunk files:`, error.message);
    }

    return { freedBytes: diskSpaceFreed, filesDeleted };
  }

  /**
   * Get cleanup statistics (for monitoring)
   */
  getStatus(): {
    isRunning: boolean;
    intervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.cleanupIntervalMs,
    };
  }

  /**
   * Manual cleanup trigger (for admin endpoint)
   */
  async triggerManualCleanup(): Promise<CleanupStats> {
    console.log('[UploadCleanup] 🔧 Manual cleanup triggered');
    return this.runCleanup();
  }
}

/**
 * Singleton instance (initialized in server.ts)
 */
let cleanupServiceInstance: UploadCleanupService | null = null;

export function initializeCleanupService(
  uploadRepo: UploadSessionRepository,
  cleanupIntervalMs?: number
): UploadCleanupService {
  if (cleanupServiceInstance) {
    console.warn('[UploadCleanup] ⚠️  Service already initialized');
    return cleanupServiceInstance;
  }

  cleanupServiceInstance = new UploadCleanupService(uploadRepo, cleanupIntervalMs);
  cleanupServiceInstance.start();

  return cleanupServiceInstance;
}

export function getCleanupService(): UploadCleanupService | null {
  return cleanupServiceInstance;
}

export function shutdownCleanupService(): void {
  if (cleanupServiceInstance) {
    cleanupServiceInstance.stop();
    cleanupServiceInstance = null;
  }
}
