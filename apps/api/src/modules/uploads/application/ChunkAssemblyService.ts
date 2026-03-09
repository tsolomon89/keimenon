/**
 * Chunk Assembly Service
 *
 * Assembles uploaded chunks into complete file after all chunks received.
 * Optimized for local disk-to-disk operations (no network latency).
 */

import { UploadSession } from '../domain/UploadSession';
import { UploadSessionRepository } from '../infrastructure/UploadSessionRepository';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { sanitizeUploadFilename } from '../../../utils/upload-filename';
import { appLogger } from '../../../utils/logger';

export interface AssemblyResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  errorMessage?: string;
}

export class ChunkAssemblyService {
  constructor(private uploadRepo: UploadSessionRepository) {}

  /**
   * Assemble all chunks into complete file
   */
  async assembleChunks(session: UploadSession): Promise<AssemblyResult> {
    appLogger.info('upload.assembly.start', {
      sessionId: session.id,
      accountId: session.accountId,
      fileName: session.fileName,
    });

    try {
      if (!session.isComplete()) {
        const missing = session.getMissingChunks();
        throw new Error(
          `Cannot assemble: ${missing.length} chunks missing (indexes: ${missing.slice(0, 10).join(', ')})`
        );
      }

      if (session.status !== 'assembling') {
        throw new Error(`Cannot assemble: session status is ${session.status}`);
      }

      const assemblyDir = join(tmpdir(), 'chat-imports');
      await fs.mkdir(assemblyDir, { recursive: true });

      const sanitizedFileName = sanitizeUploadFilename(session.fileName).sanitized;
      const outputPath = join(assemblyDir, `${session.id}-${sanitizedFileName}`);

      appLogger.debug('upload.assembly.output', {
        sessionId: session.id,
        outputPath,
        chunksPath: session.chunksPath,
        totalChunks: session.totalChunks,
      });

      const writeStream = createWriteStream(outputPath, { flags: 'w' });

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = join(session.chunksPath, `chunk_${i}`);
        try {
          await fs.access(chunkPath);
        } catch {
          throw new Error(`Chunk file missing: chunk_${i} (expected at ${chunkPath})`);
        }

        const readStream = createReadStream(chunkPath);
        await pipeline(readStream, writeStream, { end: false });
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = await fs.stat(outputPath);
      const actualSize = stats.size;
      if (actualSize !== session.fileSize) {
        throw new Error(
          `File size mismatch: expected ${session.fileSize} bytes, got ${actualSize} bytes`
        );
      }

      await this.cleanupChunks(session);

      appLogger.info('upload.assembly.succeeded', {
        sessionId: session.id,
        filePath: outputPath,
        fileSize: actualSize,
      });

      return {
        success: true,
        filePath: outputPath,
        fileSize: actualSize,
      };
    } catch (error: any) {
      appLogger.error('upload.assembly.failed', {
        sessionId: session.id,
        error: error.message,
      });

      session.markFailed(error.message);
      await this.uploadRepo.save(session);

      return {
        success: false,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Clean up temporary chunk files
   */
  private async cleanupChunks(session: UploadSession): Promise<void> {
    appLogger.debug('upload.assembly.cleanup_chunks.start', {
      sessionId: session.id,
      chunksPath: session.chunksPath,
    });

    try {
      await fs.rm(session.chunksPath, { recursive: true, force: true });
      appLogger.debug('upload.assembly.cleanup_chunks.done', {
        sessionId: session.id,
      });
    } catch (error: any) {
      appLogger.warn('upload.assembly.cleanup_chunks.failed', {
        sessionId: session.id,
        error: error.message,
      });
    }
  }

  /**
   * Trigger assembly for a completed upload session
   */
  async triggerAssembly(sessionId: string, accountId: string): Promise<AssemblyResult> {
    appLogger.info('upload.assembly.trigger', { sessionId, accountId });

    const session = await this.uploadRepo.findById(sessionId, accountId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.isComplete()) {
      throw new Error(`Session not complete: ${session.getMissingChunks().length} chunks missing`);
    }

    const result = await this.assembleChunks(session);
    if (result.success) {
      session.markCompleted();
      await this.uploadRepo.save(session);
      appLogger.info('upload.session.completed', { sessionId, accountId });
    }

    return result;
  }

  /**
   * Cancel assembly and clean up
   */
  async cancelAssembly(sessionId: string, accountId: string): Promise<void> {
    appLogger.info('upload.assembly.cancel', { sessionId, accountId });

    const session = await this.uploadRepo.findById(sessionId, accountId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await this.cleanupChunks(session);
    await this.uploadRepo.delete(sessionId, accountId);

    appLogger.info('upload.assembly.cancelled', { sessionId, accountId });
  }
}
