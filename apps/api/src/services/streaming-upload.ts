import { Request } from 'express';
import busboy from 'busboy';
import { createWriteStream, createReadStream, unlink } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface UploadProgress {
  uploadId: string;
  fileName: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  status: 'uploading' | 'processing' | 'complete' | 'error' | 'pending';
  error?: string;
  // Extended fields for import jobs API
  accountId?: string;
  userId?: string;
  startedAt?: number;
  completedAt?: number;
  progress?: number; // 0-100 overall progress (different from upload percentage)
  stats?: {
    nodesCreated: number;
    edgesCreated: number;
    sourcesCreated: number;
    conversationsProcessed: number;
  };
}

export interface UploadedFile {
  uploadId: string;
  fileName: string;
  filePath: string;
  size: number;
  mimeType: string;
}

export interface UploadResult {
  files: UploadedFile[];
  fields: Record<string, string>;
}

export class StreamingUploadService extends EventEmitter {
  private uploads: Map<string, UploadProgress> = new Map();
  private tempDir: string;
  private uploadTimeoutMs: number;

  constructor(uploadTimeoutMs?: number) {
    super();
    this.tempDir = join(tmpdir(), 'chat-imports');
    // Default 5 minutes, configurable via env var
    this.uploadTimeoutMs = uploadTimeoutMs || parseInt(process.env.UPLOAD_TIMEOUT_MS || '300000');
    this.ensureTempDir();
  }

  private ensureTempDir() {
    const fs = require('fs');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Handle streaming file upload from request
   */
  async handleUpload(req: Request): Promise<UploadedFile[]> {
    const result = await this.handleUploadWithFields(req);
    return result.files;
  }

  /**
   * Handle streaming file upload from request with form fields
   */
  async handleUploadWithFields(req: Request): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadedFiles: UploadedFile[] = [];
      const fields: Record<string, string> = {};

      console.log('[StreamingUpload] Starting upload handler');
      console.log('[StreamingUpload] Headers:', JSON.stringify(req.headers, null, 2));
      console.log(
        `[StreamingUpload] Timeout configured: ${Math.round(this.uploadTimeoutMs / 1000)}s`
      );

      // Add timeout to prevent hanging requests (configurable via env)
      const timeout = setTimeout(() => {
        const error = new Error(
          `Upload timed out after ${Math.round(this.uploadTimeoutMs / 1000)} seconds. ` +
            `Consider increasing UPLOAD_TIMEOUT_MS for large files or slow connections.`
        );
        console.error('[StreamingUpload] Timeout reached:', error);
        reject(error);
      }, this.uploadTimeoutMs);

      const bb = busboy({
        headers: req.headers,
        limits: {
          fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
          files: 10, // Max 10 files per upload
        },
      });

      bb.on('file', (fieldname, fileStream, info) => {
        const { filename, mimeType } = info;
        const uploadId = randomUUID();
        const tempFilePath = join(this.tempDir, `${uploadId}-${filename}`);

        console.log(`[StreamingUpload] Receiving file: ${filename} (${mimeType})`);

        // Validate file type
        if (!filename.match(/\.(json|jsonl)$/i)) {
          console.warn(`[StreamingUpload] Invalid file type: ${filename}`);
          fileStream.resume(); // Drain stream
          return;
        }

        const writeStream = createWriteStream(tempFilePath);
        let bytesReceived = 0;
        let totalBytes = 0;

        // Try to get content-length from headers
        const contentLength = req.headers['content-length'];
        if (contentLength) {
          totalBytes = parseInt(contentLength, 10);
        }

        // Initialize progress tracking
        const progress: UploadProgress = {
          uploadId,
          fileName: filename,
          bytesReceived: 0,
          totalBytes,
          percentage: 0,
          status: 'uploading',
        };
        this.uploads.set(uploadId, progress);

        fileStream.on('data', (chunk: Buffer) => {
          bytesReceived += chunk.length;
          progress.bytesReceived = bytesReceived;
          progress.percentage = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;

          this.emit('progress', progress);
        });

        fileStream.on('end', () => {
          const file: UploadedFile = {
            uploadId,
            fileName: filename,
            filePath: tempFilePath,
            size: bytesReceived,
            mimeType,
          };
          uploadedFiles.push(file);
        });

        fileStream.on('error', (error) => {
          progress.status = 'error';
          progress.error = error.message;
          this.emit('error', { uploadId, error });
          writeStream.destroy();
        });

        fileStream.pipe(writeStream);
      });

      bb.on('field', (fieldname, value) => {
        console.log(`[StreamingUpload] Received field: ${fieldname} (${value.length} chars)`);
        fields[fieldname] = value;
      });

      bb.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[StreamingUpload] Busboy error:', error);
        reject(error);
      });

      bb.on('finish', () => {
        clearTimeout(timeout);
        console.log(`[StreamingUpload] Upload complete: ${uploadedFiles.length} file(s) received`);
        uploadedFiles.forEach((f) => {
          console.log(`  - ${f.fileName}: ${(f.size / 1024).toFixed(2)} KB`);
        });
        resolve({ files: uploadedFiles, fields });
      });

      req.pipe(bb);
    });
  }

  /**
   * Get upload progress by ID
   */
  getProgress(uploadId: string): UploadProgress | undefined {
    return this.uploads.get(uploadId);
  }

  /**
   * Get all active uploads
   */
  getAllProgress(): UploadProgress[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Update upload status
   */
  updateStatus(uploadId: string, status: UploadProgress['status'], error?: string) {
    const progress = this.uploads.get(uploadId);
    if (progress) {
      progress.status = status;
      if (error) {
        progress.error = error;
      }
      this.emit('status-change', progress);
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanup(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Create a readable stream for the file
   */
  createReadStream(filePath: string) {
    return createReadStream(filePath, {
      highWaterMark: 64 * 1024, // 64KB chunks
    });
  }

  /**
   * Cancel an upload
   */
  cancelUpload(uploadId: string) {
    const progress = this.uploads.get(uploadId);
    if (progress) {
      progress.status = 'error';
      progress.error = 'Upload cancelled by user';
      this.uploads.delete(uploadId);
      this.emit('cancelled', uploadId);
    }
  }

  /**
   * Clean up old uploads (call periodically)
   */
  async cleanupOldUploads(maxAgeMs: number = 24 * 60 * 60 * 1000) {
    const fs = require('fs');
    const files = fs.readdirSync(this.tempDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = join(this.tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        await this.cleanup(filePath);
      }
    }
  }

  /**
   * Set metadata for upload (accountId, userId, timestamps)
   */
  setUploadMetadata(uploadId: string, metadata: Partial<UploadProgress>) {
    const progress = this.uploads.get(uploadId);
    if (progress) {
      Object.assign(progress, metadata);
    }
  }

  /**
   * Get recent uploads for an account
   * NOTE: This is an in-memory implementation. In production, this should query from database.
   */
  getRecentUploads(accountId: string, limit: number = 50): UploadProgress[] {
    const allUploads = Array.from(this.uploads.values());

    // Filter by accountId
    const accountUploads = allUploads.filter((upload) => upload.accountId === accountId);

    // Sort by startedAt (most recent first)
    accountUploads.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

    // Limit results
    return accountUploads.slice(0, limit);
  }

  /**
   * Get upload status by uploadId
   */
  getUploadStatus(uploadId: string): UploadProgress | undefined {
    return this.uploads.get(uploadId);
  }
}

// Singleton instance
export const streamingUploadService = new StreamingUploadService();
