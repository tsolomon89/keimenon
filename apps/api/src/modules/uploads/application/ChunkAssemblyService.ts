/**
 * Chunk Assembly Service
 *
 * Assembles uploaded chunks into complete file after all chunks received.
 * Optimized for local disk-to-disk operations (no network latency).
 *
 * Responsibilities:
 * - Assemble chunks into complete file
 * - Validate file integrity (size verification)
 * - Trigger import job processing
 * - Clean up temporary chunk files
 * - Handle assembly errors gracefully
 *
 * Related: Chunked Upload System - Phase 3
 */

import { UploadSession } from '../domain/UploadSession';
import { UploadSessionRepository } from '../infrastructure/UploadSessionRepository';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';

export interface AssemblyResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  errorMessage?: string;
}

/**
 * Chunk Assembly Service
 */
export class ChunkAssemblyService {
  constructor(private uploadRepo: UploadSessionRepository) {}

  /**
   * Assemble all chunks into complete file
   *
   * Optimized for local disk operations:
   * - Uses stream pipeline for memory efficiency
   * - Writes chunks sequentially in order
   * - Validates final file size matches expected
   * - No checksum computation (local trust model)
   */
  async assembleChunks(session: UploadSession): Promise<AssemblyResult> {
    console.log(`🔨 ASSEMBLE START: ${session.id} (${session.fileName})`);

    try {
      // Validate session is ready for assembly
      if (!session.isComplete()) {
        const missing = session.getMissingChunks();
        throw new Error(
          `Cannot assemble: ${missing.length} chunks missing (indexes: ${missing.slice(0, 10).join(', ')})`
        );
      }

      if (session.status !== 'assembling') {
        throw new Error(`Cannot assemble: session status is ${session.status}`);
      }

      // Create temp directory for assembled file
      const assemblyDir = join(tmpdir(), 'chat-imports');
      await fs.mkdir(assemblyDir, { recursive: true });

      // Output file path
      const outputPath = join(assemblyDir, `${session.id}-${session.fileName}`);

      console.log(`  Output: ${outputPath}`);
      console.log(`  Chunks path: ${session.chunksPath}`);
      console.log(`  Total chunks: ${session.totalChunks}`);

      // Open output file for writing
      const writeStream = createWriteStream(outputPath, { flags: 'w' });

      // Assemble chunks sequentially using pipeline
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = join(session.chunksPath, `chunk_${i}`);

        // Check if chunk file exists
        try {
          await fs.access(chunkPath);
        } catch (error) {
          throw new Error(`Chunk file missing: chunk_${i} (expected at ${chunkPath})`);
        }

        // Stream chunk into output file, keeping writeStream open
        const readStream = createReadStream(chunkPath);
        await pipeline(readStream, writeStream, { end: false });
      }

      // Explicitly close the write stream
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      console.log(`  ✅ Assembly output stream closed`);

      // Validate file size
      const stats = await fs.stat(outputPath);
      const actualSize = stats.size;

      console.log(`  Validation:`);
      console.log(`    Expected: ${session.fileSize} bytes`);
      console.log(`    Actual: ${actualSize} bytes`);

      if (actualSize !== session.fileSize) {
        throw new Error(
          `File size mismatch: expected ${session.fileSize} bytes, got ${actualSize} bytes`
        );
      }

      console.log(`  ✅ File size validated`);

      // Clean up chunk files
      await this.cleanupChunks(session);

      console.log(`✅ ASSEMBLE COMPLETE: ${session.id}`);

      return {
        success: true,
        filePath: outputPath,
        fileSize: actualSize,
      };
    } catch (error: any) {
      console.error(`❌ ASSEMBLE FAILED: ${session.id}`);
      console.error(`   Error: ${error.message}`);

      // Mark session as failed
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
    console.log(`  🗑️  Cleaning up chunks: ${session.chunksPath}`);

    try {
      await fs.rm(session.chunksPath, { recursive: true, force: true });
      console.log(`    ✅ Chunks deleted`);
    } catch (error: any) {
      console.warn(`    ⚠️  Failed to delete chunks (non-fatal): ${error.message}`);
    }
  }

  /**
   * Trigger assembly for a completed upload session
   *
   * This is called automatically when the last chunk is uploaded.
   */
  async triggerAssembly(sessionId: string, accountId: string): Promise<AssemblyResult> {
    console.log(`🚀 TRIGGER ASSEMBLY: ${sessionId}`);

    // Load session
    const session = await this.uploadRepo.findById(sessionId, accountId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Verify session is ready for assembly
    if (!session.isComplete()) {
      throw new Error(`Session not complete: ${session.getMissingChunks().length} chunks missing`);
    }

    // Assemble chunks
    const result = await this.assembleChunks(session);

    if (result.success) {
      // Mark session as completed
      session.markCompleted();
      await this.uploadRepo.save(session);

      console.log(`✅ Session completed: ${sessionId}`);
    }

    return result;
  }

  /**
   * Cancel assembly and clean up
   */
  async cancelAssembly(sessionId: string, accountId: string): Promise<void> {
    console.log(`🚫 CANCEL ASSEMBLY: ${sessionId}`);

    const session = await this.uploadRepo.findById(sessionId, accountId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Clean up chunks
    await this.cleanupChunks(session);

    // Delete session
    await this.uploadRepo.delete(sessionId, accountId);

    console.log(`✅ Assembly cancelled and cleaned up: ${sessionId}`);
  }
}
