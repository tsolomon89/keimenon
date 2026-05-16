import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelManager } from '../services/agent/model-manager';
import fs from 'fs';
import path from 'path';

describe('ModelManager', () => {
  let manager: ModelManager;
  const originalEnv = process.env.KEIMENON_MODELS_DIR;
  const testDir = path.resolve(process.cwd(), '.data/test-models');
  const manifestPath = path.join(testDir, 'models.json');

  beforeEach(() => {
    manager = new ModelManager();
    process.env.KEIMENON_MODELS_DIR = testDir;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.env.KEIMENON_MODELS_DIR = originalEnv;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return terms_required initially', async () => {
    const status = await manager.getModelStatus();
    expect(status).toBe('terms_required');
  });

  it('should return source_pending after accepting license but no source selected', async () => {
    await manager.writeInstalledModels([
      {
        model_family: 'gemma',
        model_id: null,
        license_required: true,
        license_accepted: true,
        installed: false,
      },
    ]);
    const status = await manager.getModelStatus();
    expect(status).toBe('source_pending');
  });

  it('should return ready_to_download if source is selected but not installed', async () => {
    await manager.writeInstalledModels([
      {
        model_family: 'gemma',
        model_id: null,
        source_kind: 'official_google',
        license_required: true,
        license_accepted: true,
        installed: false,
      },
    ]);
    const status = await manager.getModelStatus();
    expect(status).toBe('ready_to_download');
  });

  it('should throw when getting download plan for non-existent candidate', async () => {
    await expect(manager.getModelDownloadPlan('invalid-id')).rejects.toThrow('Candidate not found');
  });

  it('should block download plan for legacy candidates', async () => {
    // This assumes we mock getSourceCandidates or there is one. We will mock it here.
    vi.spyOn(manager, 'getSourceCandidates').mockResolvedValueOnce([
      {
        id: 'legacy-generation-something',
        model_family: 'gemma',
        model_id: 'legacy-id',
        display_name: 'Legacy Model',
        source_kind: 'manual',
        source_url: '',
        source_verified: false,
        artifact_verified: false,
        runtime_compatibility_verified: false,
        verification_notes: '',
        local_runtime_supported: false,
      },
    ]);
    await expect(manager.getModelDownloadPlan('legacy-generation-something')).rejects.toThrow(
      'Legacy generations are no longer supported'
    );
  });

  it('should block download plan if artifact is unverified', async () => {
    vi.spyOn(manager, 'getSourceCandidates').mockResolvedValueOnce([
      {
        id: 'gemma-4-test',
        model_family: 'gemma',
        model_generation: 'gemma-4',
        model_id: 'gemma-4-test',
        display_name: 'Gemma 4 Test',
        source_kind: 'manual',
        source_url: 'test.url',
        source_verified: true,
        artifact_verified: false,
        runtime_compatibility_verified: false,
        verification_notes: '',
        local_runtime_supported: false,
      },
    ]);
    const plan = await manager.getModelDownloadPlan('gemma-4-test');
    expect(plan.can_download).toBe(false);
    expect(plan.blocked_reason).toContain('pending verification');
  });

  it('should prevent path traversal in verifyModelFile', async () => {
    await manager.writeInstalledModels([
      {
        candidate_id: 'gemma-4-e2b',
        model_family: 'gemma',
        model_id: null,
        local_path: '../../../../etc/passwd',
        license_required: true,
        license_accepted: true,
        installed: true,
      },
    ]);
    const result = await manager.verifyModelFile({ candidate_id: 'gemma-4-e2b' });
    expect(result.verified).toBe(false);
    expect(result.message).toContain('Path traversal detected');
  });

  it('should return presence_verified for verifyModelFile without expected size', async () => {
    await manager.ensureModelDirectory();
    fs.writeFileSync(path.join(testDir, 'dummy.bin'), 'dummy data');

    await manager.writeInstalledModels([
      {
        candidate_id: 'gemma-4-e2b',
        model_family: 'gemma',
        model_id: null,
        local_path: 'dummy.bin',
        license_required: true,
        license_accepted: true,
        installed: true,
      },
    ]);
    const result = await manager.verifyModelFile({ candidate_id: 'gemma-4-e2b' });
    expect(result.verified).toBe(true);
    expect(result.verification_status).toBe('presence_verified');
  });

  it('should update state properly in candidate-first recordDownloadComplete', async () => {
    await manager.writeInstalledModels([
      {
        candidate_id: 'gemma-4-e2b',
        model_family: 'gemma',
        model_id: null,
        license_required: true,
        license_accepted: true,
        installed: false,
        verification_status: 'unchecked',
      },
    ]);

    await manager.recordDownloadComplete({
      candidate_id: 'gemma-4-e2b',
      local_path: 'my-model.bin',
      size_bytes: 1234,
    });

    const manifest = await manager.getManifestByCandidateId('gemma-4-e2b');
    expect(manifest?.installed).toBe(false);
    expect(manifest?.local_path).toBe('my-model.bin');
    expect(manifest?.size_bytes).toBe(1234);
    // Should NOT be verified yet
    expect(manifest?.verification_status).toBe('unchecked');
  });
});
