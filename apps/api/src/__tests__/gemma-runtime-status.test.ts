import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { GemmaLocalProvider } from '../services/agent/gemma-local-provider';
import { skillRegistry } from '../services/agent/runtime-skill-loader';

describe('GemmaLocalProvider Status Check', () => {
  let provider: GemmaLocalProvider;
  let originalEnv: NodeJS.ProcessEnv;
  let globalFetch: any;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    provider = new GemmaLocalProvider();

    globalFetch = vi.fn();
    global.fetch = globalFetch as any;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  it('returns not configured when GEMMA_LOCAL_BASE_URL is missing', async () => {
    delete process.env.GEMMA_LOCAL_BASE_URL;

    const status = await provider.checkStatus();
    expect(status.configured).toBe(false);
    expect(status.status).toBe('unavailable');
    expect(status.error_code).toBe('GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED');
  });

  it('returns unavailable when base URL cannot be reached', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';

    globalFetch.mockRejectedValue(new Error('fetch failed'));

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('unavailable');
    expect(status.error_code).toBe('GEMMA_LOCAL_RUNTIME_UNAVAILABLE');
    expect(status.error).toContain('fetch failed');
    expect(status.modelAvailable).toBe(false);
  });

  it('returns model missing when /models responds but configured model is absent', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';
    process.env.GEMMA_LOCAL_MODEL = 'gemma-4-e2b';

    globalFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'other-model-1' }, { id: 'other-model-2' }],
      }),
    });

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('offline');
    expect(status.error_code).toBe('GEMMA_MODEL_NOT_FOUND');
    expect(status.modelAvailable).toBe(false);
  });

  it('returns model missing when configured model is not a Gemma model family', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';
    process.env.GEMMA_LOCAL_MODEL = 'llama3';

    globalFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'llama3' }],
      }),
    });

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('offline');
    expect(status.error_code).toBe('GEMMA_MODEL_NOT_FOUND');
    expect(status.error).toContain('is not a Gemma model family');
    expect(status.modelAvailable).toBe(false);
  });

  it('returns online when configured model is present (OpenAI shape)', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';
    process.env.GEMMA_LOCAL_MODEL = 'gemma-4-e2b';

    globalFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'other-model-1' }, { id: 'gemma-4-e2b' }],
      }),
    });

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('online');
    expect(status.error_code).toBeUndefined();
    expect(status.modelAvailable).toBe(true);
  });

  it('returns online when configured model is present (Ollama native shape)', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/api';
    process.env.GEMMA_LOCAL_MODEL = 'gemma-4-e2b';

    globalFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'other-model' }, { name: 'gemma-4-e2b' }],
      }),
    });

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('online');
    expect(status.error_code).toBeUndefined();
    expect(status.modelAvailable).toBe(true);
  });

  it('returns offline when HTTP status is not ok', async () => {
    process.env.GEMMA_LOCAL_BASE_URL = 'http://localhost:11434/v1';

    globalFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const status = await provider.checkStatus();
    expect(status.configured).toBe(true);
    expect(status.status).toBe('offline');
    expect(status.error_code).toBe('GEMMA_STATUS_CHECK_FAILED');
    expect(status.error).toContain('HTTP 500');
    expect(status.modelAvailable).toBe(false);
  });
});

describe('Runtime Skill Loading', () => {
  beforeAll(() => {
    skillRegistry.loadRuntimeSkills();
  });

  it('loads bounded-answer skill successfully', () => {
    const skill = skillRegistry.selectRuntimeSkill('bounded-answer');
    expect(skill).toBeDefined();
    expect(skill.id).toBe('bounded-answer');
  });
});
