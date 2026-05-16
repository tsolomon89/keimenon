import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localInferenceManager } from '../services/agent/local-inference-manager';
import { nativeGemmaBackend } from '../services/agent/native-gemma-runtime-backend';
import { gemmaProvider } from '../services/agent/gemma-local-provider';

describe('LocalInferenceManager', () => {
  const originalEnv = process.env.GEMMA_LOCAL_BASE_URL;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env.GEMMA_LOCAL_BASE_URL = originalEnv;
  });

  it('should return native status when native backend is ready', async () => {
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

  it('should fall back to openai-compatible when configured and native is unimplemented', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';

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

  it('should return native status (unimplemented) if fallback is not configured', async () => {
    delete process.env.GEMMA_LOCAL_BASE_URL;

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
