import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { modelManager } from './model-manager';
import { gemmaModelSourceRegistry } from './gemma-model-source-registry';
import { EventEmitter } from 'events';

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
  ) {
    const active = this.activeDownloads.get(candidateId)!;

    try {
      const headers: Record<string, string> = {};
      if (startOffset > 0) {
        headers['Range'] = `bytes=${startOffset}-`;
      }

      const response = await fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (!response.ok && response.status !== 206) {
        // If range request fails, fallback to full download
        if (startOffset > 0) {
          console.warn(
            `[ModelDownloader] Range request failed (status ${response.status}). Retrying full download...`
          );
          fs.writeFileSync(tempPath, ''); // Reset temp file
          active.bytesDownloaded = 0;
          this.runDownloadLoop(
            candidateId,
            url,
            tempPath,
            finalPath,
            0,
            expectedSize,
            abortController
          );
          return;
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
      } else if (contentLengthHeader && startOffset === 0) {
        totalBytes = parseInt(contentLengthHeader, 10);
      }

      active.totalBytes = totalBytes;

      const fileStream = fs.createWriteStream(tempPath, {
        flags: startOffset > 0 ? 'r+' : 'w',
        start: startOffset,
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();

      this.emit('progress', this.getProgress(candidateId));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        active.bytesDownloaded += value.length;

        this.emit('progress', this.getProgress(candidateId));
      }

      fileStream.end();

      // Check downloaded size
      const stats = fs.statSync(tempPath);
      if (expectedSize > 0 && stats.size !== expectedSize) {
        throw new Error(`Size mismatch. Expected ${expectedSize} bytes, got ${stats.size}`);
      }

      // Rename to final path upon success
      fs.renameSync(tempPath, finalPath);

      active.status = 'completed';
      this.emit('progress', this.getProgress(candidateId));

      // Mark installed inside ModelManager
      await modelManager.recordDownloadComplete({
        candidate_id: candidateId,
        local_path: path.basename(finalPath),
        size_bytes: stats.size,
      });

      // Verify files officially
      await modelManager.verifyModelFile({ candidate_id: candidateId });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        active.status = 'paused';
        this.emit('progress', this.getProgress(candidateId));
        return;
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
    if (active && active.status === 'downloading') {
      active.abortController.abort();
      active.status = 'paused';
      this.emit('progress', this.getProgress(candidateId));
    }
  }
}

export const modelDownloader = new ModelDownloader();
