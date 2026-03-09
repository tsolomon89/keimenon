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
    const fileBlob = await fs.openAsBlob(filePath, { type: 'application/json' });
    const formData = new FormData();

    formData.append('files', fileBlob, fileName);
    formData.append(
      'config',
      JSON.stringify(
        normalizeImportOptions({
          platform: 'generic',
          processingMode: 'automatic',
          duplicateDetection: { enabled: true },
        })
      )
    );

    log.info(`[Ingest] Submitting /api/v1/jobs/import`, {
      apiPort: this.apiPort,
      fileName,
      fileSize: fileStats.size,
      importContractVersion: IMPORT_CONTRACT_VERSION,
    });

    const response = await fetch(`http://127.0.0.1:${this.apiPort}/api/v1/jobs/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const data = (await response.json().catch(() => ({}))) as ImportJobResponse;

    if (!response.ok) {
      const message = data.error || data.message || `HTTP ${response.status}`;
      throw new Error(`Desktop import enqueue failed: ${message}`);
    }

    return data;
  }

  private sendProgress(stage: string, percent: number, message: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ingest:progress', { stage, percent, message });
    }
  }
}
