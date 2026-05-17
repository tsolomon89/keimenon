import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localInferenceManager } from '../services/agent/local-inference-manager';
import { nativeGemmaBackend } from '../services/agent/native-gemma-runtime-backend';
import { gemmaProvider } from '../services/agent/gemma-local-provider';
import { modelManager } from '../services/agent/model-manager';

describe('LocalInferenceManager', () => {
  const originalEnv = process.env.GEMMA_LOCAL_BASE_URL;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env.GEMMA_LOCAL_BASE_URL = originalEnv;
  });

  it('should return model_missing if modelManager says source_pending', async () => {
    vi.spyOn(modelManager, 'getModelStatus').mockResolvedValueOnce('source_pending' as any);
    const status = await localInferenceManager.getCombinedStatus();
    expect(status.state).toBe('model_missing');
    expect(status.next_actions.map((a) => a.id)).toContain('open-model-folder');
  });

  it('should return license_required if modelManager says terms_required', async () => {
    vi.spyOn(modelManager, 'getModelStatus').mockResolvedValueOnce('terms_required' as any);
    const status = await localInferenceManager.getCombinedStatus();
    expect(status.state).toBe('license_required');
    expect(status.next_actions.map((a) => a.id)).toContain('accept-terms');
  });

  it('should check native backend if modelManager says presence_verified', async () => {
    vi.spyOn(modelManager, 'getModelStatus').mockResolvedValueOnce('presence_verified' as any);

    vi.spyOn(nativeGemmaBackend, 'checkStatus').mockResolvedValueOnce({
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'ready',
      can_run_offline: true,
      requires_admin: false,
      message: 'Native ready',
      next_actions: [],
    });

    const status = await localInferenceManager.getCombinedStatus();
    expect(status.state).toBe('ready');
    expect(status.preferred_backend).toBe('native-gemma');
    expect(status.active_backend).toBeUndefined();
  });

  it('should fall back to openai-compatible when configured and native is unimplemented (and model presence_verified)', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';

    vi.spyOn(modelManager, 'getModelStatus').mockResolvedValueOnce('presence_verified' as any);

    vi.spyOn(nativeGemmaBackend, 'checkStatus').mockResolvedValueOnce({
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'runtime_unimplemented',
      can_run_offline: true,
      requires_admin: false,
      message: 'Not implemented',
      next_actions: [],
    });

    vi.spyOn(gemmaProvider, 'checkStatus').mockResolvedValueOnce({
      configured: true,
      status: 'online',
      modelName: 'gemma:2b',
    });

    const status = await localInferenceManager.getCombinedStatus();
    expect(status.state).toBe('ready');
    expect(status.active_backend).toBe('openai-compatible');
    expect(status.model_id).toBe('gemma:2b');
  });

  it('should return native status (unimplemented) if fallback is not configured (and model presence_verified)', async () => {
    delete process.env.GEMMA_LOCAL_BASE_URL;

    vi.spyOn(modelManager, 'getModelStatus').mockResolvedValueOnce('presence_verified' as any);

    vi.spyOn(nativeGemmaBackend, 'checkStatus').mockResolvedValueOnce({
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'runtime_unimplemented',
      can_run_offline: true,
      requires_admin: false,
      message: 'Not implemented',
      next_actions: [],
    });

    const status = await localInferenceManager.getCombinedStatus();
    expect(status.state).toBe('runtime_unimplemented');
    expect(status.active_backend).toBeUndefined();
  });
});
