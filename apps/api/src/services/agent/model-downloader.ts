import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { modelManager } from './model-manager';
import { gemmaModelSourceRegistry } from './gemma-model-source-registry';

export interface DownloadProgress {
  candidateId: string;
  bytesDownloaded: number;
  totalBytes: number;
  progressPercent: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  error?: string;
}

class ModelDownloader extends EventEmitter {
  private activeDownloads: Map<
    string,
    {
      abortController: AbortController;
      bytesDownloaded: number;
      totalBytes: number;
      tempPath: string;
      status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
      retryCount: number;
      retryTimeout?: NodeJS.Timeout;
    }
  > = new Map();

  public getProgress(candidateId: string): DownloadProgress | null {
    const active = this.activeDownloads.get(candidateId);
    if (!active) return null;

    return {
      candidateId,
      bytesDownloaded: active.bytesDownloaded,
      totalBytes: active.totalBytes,
      progressPercent:
        active.totalBytes > 0 ? Math.round((active.bytesDownloaded / active.totalBytes) * 100) : 0,
      status: active.status,
    };
  }

  public async startDownload(candidateId: string): Promise<void> {
    if (this.activeDownloads.has(candidateId)) {
      const active = this.activeDownloads.get(candidateId)!;
      if (active.status === 'downloading') {
        return; // Already downloading
      }
    }

    const candidates = await gemmaModelSourceRegistry.getCandidates();
    const candidate = candidates.find((c) => c.id === candidateId);

    if (!candidate) {
      throw new Error(`Candidate '${candidateId}' not found in registry.`);
    }

    if (!candidate.download_url) {
      throw new Error(`Candidate '${candidateId}' does not support direct downloading.`);
    }

    await modelManager.ensureModelDirectory();
    await modelManager.recordDownloadStarted(candidateId);

    const modelDir = modelManager.getModelDirectory();
    const tempPath = path.resolve(modelDir, `${candidate.id}.tmp`);
    const localFilename = candidate.download_url
      ? path.basename(candidate.download_url)
      : `${candidate.id}.litertlm`;
    const finalPath = path.resolve(modelDir, localFilename);

    const abortController = new AbortController();

    // Check if partial file exists for resume capability
    let bytesDownloaded = 0;
    if (fs.existsSync(tempPath)) {
      const stats = fs.statSync(tempPath);
      bytesDownloaded = stats.size;
    }

    const totalBytes = candidate.expected_size_bytes || 0;

    this.activeDownloads.set(candidateId, {
      abortController,
      bytesDownloaded,
      totalBytes,
      tempPath,
      status: 'downloading',
      retryCount: 0,
    });

    // Run async download
    this.runDownloadLoop(
      candidateId,
      candidate.download_url,
      tempPath,
      finalPath,
      bytesDownloaded,
      totalBytes,
      abortController
    );
  }

  private async runDownloadLoop(
    candidateId: string,
    url: string,
    tempPath: string,
    finalPath: string,
    startOffset: number,
    expectedSize: number,
    abortController: AbortController
  ): Promise<void> {
    const active = this.activeDownloads.get(candidateId);
    if (!active) return;

    let fileStream: fs.WriteStream | null = null;

    try {
      const headers: Record<string, string> = {};
      if (startOffset > 0) {
        headers['Range'] = `bytes=${startOffset}-`;
      }

      const response = await fetch(url, {
        headers,
        signal: abortController.signal,
      });

      let actualStartOffset = startOffset;

      // Handle range responses and edge cases:
      // 1) If resumed request was sent with Range header, but server returned 200 OK instead of 206:
      // Server returned the full file body from byte 0. Truncate temp file and reset offset.
      if (startOffset > 0 && response.status === 200) {
        console.warn(
          `[ModelDownloader] Range request for ${candidateId} answered with 200 instead of 206. Resetting to full download.`
        );
        actualStartOffset = 0;
        active.bytesDownloaded = 0;
        if (fs.existsSync(tempPath)) {
          fs.truncateSync(tempPath, 0);
        }
      } else if (response.status === 206) {
        // Validate Content-Range header
        const contentRange = response.headers.get('content-range');
        if (contentRange) {
          const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
          if (match) {
            const rangeStart = parseInt(match[1], 10);
            if (rangeStart !== startOffset) {
              console.warn(
                `[ModelDownloader] Content-Range start (${rangeStart}) does not match expected offset (${startOffset}). Resetting to full download.`
              );
              if (fs.existsSync(tempPath)) {
                fs.truncateSync(tempPath, 0);
              }
              active.bytesDownloaded = 0;
              return this.runDownloadLoop(
                candidateId,
                url,
                tempPath,
                finalPath,
                0,
                expectedSize,
                abortController
              );
            }
          }
        }
      } else if (response.status === 416) {
        // Range Not Satisfiable - partial file is corrupt or exceeds remote size
        console.warn(
          `[ModelDownloader] HTTP 416 Range Not Satisfiable for ${candidateId}. Resetting temp file and restarting full download.`
        );
        if (fs.existsSync(tempPath)) {
          fs.truncateSync(tempPath, 0);
        }
        active.bytesDownloaded = 0;
        return this.runDownloadLoop(
          candidateId,
          url,
          tempPath,
          finalPath,
          0,
          expectedSize,
          abortController
        );
      } else if (!response.ok) {
        // If range request failed with an error, reset temp file and try full download once
        if (startOffset > 0) {
          console.warn(
            `[ModelDownloader] Range request failed with HTTP ${response.status}. Retrying full download...`
          );
          if (fs.existsSync(tempPath)) {
            fs.truncateSync(tempPath, 0);
          }
          active.bytesDownloaded = 0;
          return this.runDownloadLoop(
            candidateId,
            url,
            tempPath,
            finalPath,
            0,
            expectedSize,
            abortController
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Resolve total size from Content-Length or Content-Range
      let totalBytes = expectedSize;
      const contentLengthHeader = response.headers.get('content-length');
      const contentRangeHeader = response.headers.get('content-range');

      if (contentRangeHeader) {
        const match = contentRangeHeader.match(/\/(\d+)$/);
        if (match) totalBytes = parseInt(match[1], 10);
      } else if (contentLengthHeader) {
        const parsedLength = parseInt(contentLengthHeader, 10);
        if (actualStartOffset === 0) {
          totalBytes = parsedLength;
        } else if (parsedLength > 0) {
          totalBytes = actualStartOffset + parsedLength;
        }
      }

      active.totalBytes = totalBytes;

      const fileExists = fs.existsSync(tempPath);
      const useResume = actualStartOffset > 0 && fileExists;
      if (!fileExists) {
        actualStartOffset = 0;
      }

      fileStream = fs.createWriteStream(tempPath, {
        flags: useResume ? 'r+' : 'w',
        start: actualStartOffset,
      });

      fileStream.on('error', (streamErr) => {
        console.warn(
          `[ModelDownloader] File stream error for ${candidateId}: ${streamErr.message}`
        );
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();

      this.emit('progress', this.getProgress(candidateId));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = Buffer.from(value);
        const canWrite = fileStream.write(chunk);
        if (!canWrite) {
          await new Promise<void>((resolve, reject) => {
            fileStream!.once('drain', resolve);
            fileStream!.once('error', reject);
          });
        }
        active.bytesDownloaded += chunk.length;

        this.emit('progress', this.getProgress(candidateId));
      }

      // Ensure write stream has flushed completely to disk
      await new Promise<void>((resolve, reject) => {
        if (!fileStream) return resolve();
        fileStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      fileStream = null;

      // 1. Verify downloaded file size on tempPath
      const stats = await fs.promises.stat(tempPath);
      active.bytesDownloaded = stats.size;

      const candidates = await gemmaModelSourceRegistry.getCandidates();
      const candidate = candidates.find((c) => c.id === candidateId);

      const requiredSize = candidate?.expected_size_bytes || expectedSize;
      if (candidate?.artifact_verified && (!requiredSize || requiredSize <= 0)) {
        throw new Error(
          `Candidate '${candidateId}' is marked as artifact_verified but missing expected_size_bytes.`
        );
      }

      if (requiredSize > 0 && stats.size !== requiredSize) {
        throw new Error(`Size mismatch. Expected ${requiredSize} bytes, got ${stats.size}`);
      }

      // 2. Verify checksum on tempPath
      if (candidate?.artifact_verified && !candidate?.checksum) {
        throw new Error(
          `Candidate '${candidateId}' is marked as artifact_verified but missing trusted checksum.`
        );
      }

      if (candidate?.checksum) {
        const hash = crypto.createHash('sha256');
        const fileReadStream = fs.createReadStream(tempPath);
        for await (const chunk of fileReadStream) {
          hash.update(chunk);
        }
        const calculatedHash = hash.digest('hex');
        if (calculatedHash !== candidate.checksum) {
          throw new Error(
            `Model checksum verification failed. Expected ${candidate.checksum}, got ${calculatedHash}`
          );
        }
      }

      // 3. Rename to final path only AFTER verification succeeds on tempPath
      await fs.promises.rename(tempPath, finalPath);

      active.status = 'completed';
      this.emit('progress', this.getProgress(candidateId));

      // 4. Mark installed inside ModelManager
      await modelManager.recordDownloadComplete({
        candidate_id: candidateId,
        local_path: path.basename(finalPath),
        size_bytes: stats.size,
      });

      // 5. Verify files officially
      await modelManager.verifyModelFile({ candidate_id: candidateId });
    } catch (err: any) {
      if (fileStream) {
        try {
          (fileStream as fs.WriteStream).destroy();
        } catch (_) {
          // ignore
        }
        fileStream = null;
      }

      if (err.name === 'AbortError') {
        active.status = 'paused';
        this.emit('progress', this.getProgress(candidateId));
        return;
      }

      const isVerificationError =
        err.message?.includes('checksum verification failed') ||
        err.message?.includes('Size mismatch');

      // Check if we can retry (only for network/IO errors, not checksum or size corruption)
      if (!isVerificationError && active.status === 'downloading' && active.retryCount < 5) {
        active.retryCount++;
        const isTest = process.env.VITEST || process.env.NODE_ENV === 'test';
        const delay = isTest ? 1 : Math.min(1000 * Math.pow(2, active.retryCount), 15000);
        console.warn(
          `[ModelDownloader] Download error for ${candidateId}: ${err.message}. Retrying ${active.retryCount}/5 in ${delay}ms...`
        );

        active.retryTimeout = setTimeout(() => {
          active.retryTimeout = undefined;
          if (active.status !== 'downloading') return;

          let currentSize = 0;
          if (fs.existsSync(tempPath)) {
            try {
              const stats = fs.statSync(tempPath);
              currentSize = stats.size;
            } catch (_) {
              // ignore
            }
          }
          active.bytesDownloaded = currentSize;

          const newAbortController = new AbortController();
          active.abortController = newAbortController;

          this.runDownloadLoop(
            candidateId,
            url,
            tempPath,
            finalPath,
            currentSize,
            expectedSize,
            newAbortController
          );
        }, delay);
        return;
      }

      // Cleanup stale/corrupted partial staged file if failed permanently or verification failed
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {
          // ignore
        }
      }

      active.status = 'failed';
      this.emit('progress', {
        ...this.getProgress(candidateId)!,
        error: err.message,
      });

      await modelManager.recordDownloadFailed(candidateId, err.message);
    }
  }

  public cancelDownload(candidateId: string): void {
    const active = this.activeDownloads.get(candidateId);
    if (active) {
      if (active.retryTimeout) {
        clearTimeout(active.retryTimeout);
        active.retryTimeout = undefined;
      }
      if (active.status === 'downloading') {
        active.status = 'paused';
        active.abortController.abort();
        this.emit('progress', this.getProgress(candidateId));
      }
    }
  }

  public reset(): void {
    for (const [_, active] of this.activeDownloads.entries()) {
      if (active.retryTimeout) {
        clearTimeout(active.retryTimeout);
        active.retryTimeout = undefined;
      }
      try {
        active.abortController.abort();
      } catch (_) {
        // ignore
      }
    }
    this.activeDownloads.clear();
  }
}

export const modelDownloader = new ModelDownloader();
