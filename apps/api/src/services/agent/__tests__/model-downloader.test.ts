import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { modelDownloader } from '../model-downloader';
import { modelManager } from '../model-manager';
import { gemmaModelSourceRegistry } from '../gemma-model-source-registry';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

vi.mock('../gemma-model-source-registry', () => ({
  gemmaModelSourceRegistry: {
    getCandidates: vi.fn(),
  },
}));

describe('ModelDownloader & ModelManager Hardening', () => {
  const originalEnv = process.env.KEIMENON_MODELS_DIR;
  const testDir = path.resolve(process.cwd(), '.data/test-downloader-models');
  const tempPath = path.join(testDir, 'gemma-4-e2b-it-litert.tmp');
  const finalPath = path.join(testDir, 'gemma-4-E2B-it.litertlm');

  beforeEach(() => {
    process.env.KEIMENON_MODELS_DIR = testDir;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Abort and clear active downloads to prevent background async loops from leaking
    for (const [candidateId, active] of (modelDownloader as any).activeDownloads.entries()) {
      if (active.status === 'downloading') {
        try {
          active.abortController.abort();
        } catch (_) {
          // ignore
        }
      }
    }
    (modelDownloader as any).activeDownloads.clear();

    process.env.KEIMENON_MODELS_DIR = originalEnv;
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (_) {
        // ignore
      }
    }
  });

  it('should calculate exponential backoff delay correctly and clean up temp file on permanent failure', async () => {
    vi.mocked(gemmaModelSourceRegistry.getCandidates).mockResolvedValue([
      {
        id: 'gemma-4-e2b-it-litert',
        model_family: 'gemma',
        display_name: 'Gemma 4 E2B',
        source_kind: 'official_huggingface',
        source_url: 'https://huggingface.co',
        download_url: 'https://huggingface.co/gemma-4-E2B-it.litertlm',
        source_verified: true,
        artifact_verified: true,
        runtime_compatibility_verified: true,
        verification_notes: '',
        local_runtime_supported: true,
        expected_size_bytes: 100,
      },
    ]);

    // Mock fetch to repeatedly throw network errors (socket drops)
    const mockFetch = vi.fn().mockRejectedValue(new Error('Fetch failed (socket dropped)'));
    global.fetch = mockFetch;

    // Pre-seed some dummy data in temp file to check cleanup later
    fs.writeFileSync(tempPath, 'partial weight data');

    // Start the download
    await modelManager.prepareModelDownload('gemma-4-e2b-it-litert');
    const downloaderPromise = modelDownloader.startDownload('gemma-4-e2b-it-litert');

    // Yield control and let all 5 retries run (since VITEST causes backoff delay to be 1ms)
    await new Promise((resolve) => setTimeout(resolve, 150));

    const active = (modelDownloader as any).activeDownloads.get('gemma-4-e2b-it-litert');
    expect(active).toBeDefined();

    // The temp file should be deleted upon permanent failure
    expect(fs.existsSync(tempPath)).toBe(false);
    expect(active.status).toBe('failed');
  });

  describe('ModelManager SHA-256 Checksums', () => {
    it('should verify SHA-256 successfully if the checksum matches', async () => {
      const dummyContent = 'Gemma weight dummy data';
      const hash = crypto.createHash('sha256').update(dummyContent).digest('hex');

      fs.writeFileSync(finalPath, dummyContent);

      vi.mocked(gemmaModelSourceRegistry.getCandidates).mockResolvedValue([
        {
          id: 'gemma-4-e2b-it-litert',
          model_family: 'gemma',
          display_name: 'Gemma 4 E2B',
          source_kind: 'official_huggingface',
          source_url: '',
          source_verified: true,
          artifact_verified: true,
          runtime_compatibility_verified: true,
          verification_notes: '',
          local_runtime_supported: true,
          checksum: hash,
        },
      ]);

      await modelManager.writeInstalledModels([
        {
          candidate_id: 'gemma-4-e2b-it-litert',
          model_family: 'gemma',
          model_id: null,
          local_path: 'gemma-4-E2B-it.litertlm',
          license_required: true,
          license_accepted: true,
          installed: false,
        },
      ]);

      const result = await modelManager.verifyModelFile({ candidate_id: 'gemma-4-e2b-it-litert' });
      expect(result.verified).toBe(true);
      expect(result.verification_status).toBe('verified');
      expect(result.message).toContain('checksum verified');
    });

    it('should fail verification if the checksum does not match', async () => {
      const dummyContent = 'Gemma weight dummy data';
      fs.writeFileSync(finalPath, dummyContent);

      vi.mocked(gemmaModelSourceRegistry.getCandidates).mockResolvedValue([
        {
          id: 'gemma-4-e2b-it-litert',
          model_family: 'gemma',
          display_name: 'Gemma 4 E2B',
          source_kind: 'official_huggingface',
          source_url: '',
          source_verified: true,
          artifact_verified: true,
          runtime_compatibility_verified: true,
          verification_notes: '',
          local_runtime_supported: true,
          checksum: 'wrong_checksum_value',
        },
      ]);

      await modelManager.writeInstalledModels([
        {
          candidate_id: 'gemma-4-e2b-it-litert',
          model_family: 'gemma',
          model_id: null,
          local_path: 'gemma-4-E2B-it.litertlm',
          license_required: true,
          license_accepted: true,
          installed: false,
        },
      ]);

      const result = await modelManager.verifyModelFile({ candidate_id: 'gemma-4-e2b-it-litert' });
      expect(result.verified).toBe(false);
      expect(result.verification_status).toBe('failed');
      expect(result.message).toContain('checksum verification failed');
    });
  });

  describe('ModelManager Stale staged files cleanups', () => {
    it('should sweep staged temp files older than 24 hours', async () => {
      const staleTempPath = path.join(testDir, 'stale-model.tmp');
      const freshTempPath = path.join(testDir, 'fresh-model.tmp');

      fs.writeFileSync(staleTempPath, 'stale weight data');
      fs.writeFileSync(freshTempPath, 'fresh weight data');

      // Set stale temp file modified time to 48 hours ago
      const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      fs.utimesSync(staleTempPath, staleTime, staleTime);

      const sweepResult = await modelManager.sweepStaleStagedFiles();
      expect(sweepResult.sweptCount).toBe(1);

      expect(fs.existsSync(staleTempPath)).toBe(false);
      expect(fs.existsSync(freshTempPath)).toBe(true);
    });
  });
});
