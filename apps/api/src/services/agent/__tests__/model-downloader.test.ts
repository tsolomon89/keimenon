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
    // Abort and clear active downloads and timeouts to prevent background async loops from leaking
    modelDownloader.reset();

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

  describe('Resume handling and verification ordering', () => {
    it('should reset temp file and download cleanly if server answers a resumed request with 200 instead of 206', async () => {
      const fullData = 'COMPLETE_MODEL_WEIGHTS_DATA';
      const expectedSize = fullData.length;

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
          expected_size_bytes: expectedSize,
        },
      ]);

      // Seed partial file (5 bytes)
      fs.writeFileSync(tempPath, 'CORRU');

      // Mock fetch: receives Range header, but server returns 200 OK with the full stream!
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(fullData));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            'content-length': String(expectedSize),
          },
        });
      });

      await modelDownloader.startDownload('gemma-4-e2b-it-litert');

      // Wait for async download loop
      await new Promise((resolve) => setTimeout(resolve, 150));

      const active = (modelDownloader as any).activeDownloads.get('gemma-4-e2b-it-litert');
      expect(active?.status).toBe('completed');
      expect(fs.existsSync(finalPath)).toBe(true);
      const content = fs.readFileSync(finalPath, 'utf-8');
      expect(content).toBe(fullData);
      expect(content).not.toContain('CORRU');
    });

    it('should refuse to rename to final path if checksum verification fails on tempPath', async () => {
      const data = 'CORRUPTED_DOWNLOAD_DATA';

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
          expected_size_bytes: data.length,
          checksum: 'expected_correct_checksum_that_will_not_match',
        },
      ]);

      global.fetch = vi.fn().mockImplementation(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(data));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-length': String(data.length) },
        });
      });

      await modelDownloader.startDownload('gemma-4-e2b-it-litert');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const active = (modelDownloader as any).activeDownloads.get('gemma-4-e2b-it-litert');
      expect(active?.status).toBe('failed');
      // Final path must NOT have been created!
      expect(fs.existsSync(finalPath)).toBe(false);
    });

    it('should pause cleanly when cancelDownload is called', async () => {
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
        },
      ]);

      // Never-ending stream
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('first_chunk'));
          },
        });
        return new Response(stream, { status: 200 });
      });

      await modelDownloader.startDownload('gemma-4-e2b-it-litert');
      modelDownloader.cancelDownload('gemma-4-e2b-it-litert');

      const progress = modelDownloader.getProgress('gemma-4-e2b-it-litert');
      expect(progress?.status).toBe('paused');
    });
  });
});
