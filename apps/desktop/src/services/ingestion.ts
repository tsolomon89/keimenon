import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { normalizeImportOptions, IMPORT_CONTRACT_VERSION } from '@keimenon/types';
import { secureStorage } from './secure-storage';

interface ImportJobResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

interface UploadSessionResponse {
  success: boolean;
  session?: {
    id: string;
    totalChunks: number;
    chunkSize: number;
    jobId?: string | null;
  };
  error?: string;
}

export class FileIngestionService {
  constructor(
    private mainWindow: BrowserWindow,
    private apiPort: number
  ) {}

  setApiPort(port: number): void {
    this.apiPort = port;
  }

  async ingestFile(filePath: string): Promise<{ success: boolean; jobId: string }> {
    try {
      log.info(`[Ingest] Starting ingestion job for: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      log.info(`[Ingest] Preparing file ${fileName} (${stats.size} bytes)`);

      this.sendProgress('uploading', 10, 'Preparing desktop import submission...');

      const accessToken = await this.getAccessToken();
      const response = await this.createImportJob(filePath, accessToken);

      if (!response.success || !response.jobId) {
        throw new Error(response.error || 'Import job creation failed');
      }

      log.info(`[Ingest] Job created through shared API flow: ${response.jobId}`);
      this.sendProgress('queued', 0, `Job queued for processing (${response.jobId})`);

      return { success: true, jobId: response.jobId };
    } catch (err: unknown) {
      log.error('[Ingest] Failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sendProgress('error', 0, `Failed: ${errorMessage}`);
      throw err;
    }
  }

  private async getAccessToken(): Promise<string> {
    const activeAccountId = await secureStorage.getActiveAccountId();
    if (!activeAccountId) {
      throw new Error('No active account. Please sign in before importing files.');
    }

    const accessToken =
      (await secureStorage.getAccountToken(activeAccountId, 'access_token')) ||
      (await secureStorage.getToken('access_token'));

    if (!accessToken) {
      throw new Error('No access token found for active account. Please sign in again.');
    }

    return accessToken;
  }

  private async createImportJob(filePath: string, accessToken: string): Promise<ImportJobResponse> {
    const fileName = path.basename(filePath);
    const fileStats = fs.statSync(filePath);
    const chunkSize = 10 * 1024 * 1024;
    const apiBaseUrl = `http://127.0.0.1:${this.apiPort}`;

    log.info(`[Ingest] Starting chunked upload import`, {
      apiPort: this.apiPort,
      fileName,
      fileSize: fileStats.size,
      importContractVersion: IMPORT_CONTRACT_VERSION,
      chunkSize,
    });

    const initiateResponse = await fetch(`${apiBaseUrl}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName,
        fileSize: fileStats.size,
        mimeType: 'application/json',
        chunkSize,
        importConfig: normalizeImportOptions({
          platform: 'generic',
          processingMode: 'automatic',
          duplicateDetection: { enabled: true },
        }),
      }),
    });

    const initiateData = (await initiateResponse.json().catch(() => ({}))) as UploadSessionResponse;
    if (!initiateResponse.ok || !initiateData.success || !initiateData.session?.id) {
      const message = initiateData.error || `HTTP ${initiateResponse.status}`;
      throw new Error(`Desktop import initiate failed: ${message}`);
    }

    const { id: sessionId, totalChunks } = initiateData.session;
    const fd = fs.openSync(filePath, 'r');
    let jobId: string | undefined =
      typeof initiateData.session.jobId === 'string' && initiateData.session.jobId.length > 0
        ? initiateData.session.jobId
        : undefined;

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const length = Math.min(chunkSize, fileStats.size - start);
        const buffer = Buffer.alloc(length);
        const bytesRead = fs.readSync(fd, buffer, 0, length, start);
        const payload = bytesRead === length ? buffer : buffer.subarray(0, bytesRead);

        const chunkResponse = await fetch(
          `${apiBaseUrl}/api/v1/uploads/${sessionId}/chunks/${chunkIndex}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: payload,
          }
        );
        const chunkData = (await chunkResponse.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          message?: string;
          jobId?: string;
        };
        if (!chunkResponse.ok || chunkData.success !== true) {
          const message =
            chunkData.message ||
            chunkData.error ||
            `HTTP ${chunkResponse.status} on chunk ${chunkIndex}`;
          throw new Error(`Desktop import chunk upload failed: ${message}`);
        }

        if (chunkData.jobId) {
          jobId = chunkData.jobId;
        }

        const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        this.sendProgress('uploading', percent, `Uploaded ${chunkIndex + 1}/${totalChunks} chunks`);
      }
    } finally {
      fs.closeSync(fd);
    }

    if (!jobId) {
      const statusResponse = await fetch(`${apiBaseUrl}/api/v1/uploads/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const statusData = (await statusResponse.json().catch(() => ({}))) as {
        success?: boolean;
        session?: { jobId?: string };
      };
      jobId = statusData.session?.jobId;
    }

    if (!jobId) {
      throw new Error('Desktop import upload completed but no job ID was returned.');
    }

    return {
      success: true,
      jobId,
      message: 'Import job created through chunked upload rail',
    };
  }

  private sendProgress(stage: string, percent: number, message: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ingest:progress', { stage, percent, message });
    }
  }
}
