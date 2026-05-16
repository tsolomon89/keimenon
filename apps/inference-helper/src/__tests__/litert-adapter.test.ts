import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiteRTGemmaRuntimeAdapter } from '../litert-adapter';
import fs from 'fs';

vi.mock('fs');

describe('LiteRTGemmaRuntimeAdapter', () => {
  let adapter: LiteRTGemmaRuntimeAdapter;

  beforeEach(() => {
    adapter = new LiteRTGemmaRuntimeAdapter();
    vi.resetAllMocks();
  });

  it('validateModelFile reports missing file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await adapter.validateModelFile('fake/path.litertlm');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('model_missing');
  });

  it('validateModelFile reports wrong extension', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = await adapter.validateModelFile('fake/path.bin');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('model_invalid');
    expect(result.message).toContain('must be a .litertlm file');
  });

  it('validateModelFile reports dependency missing when valid file but no bindings', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = await adapter.validateModelFile('fake/path.litertlm');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('runtime_dependency_missing');
  });

  it('loadModel reports dependency missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = await adapter.loadModel('fake/path.litertlm');
    expect(result.success).toBe(false);
    expect(result.state).toBe('runtime_dependency_missing');
  });

  it('generate returns unimplemented/dependency missing', async () => {
    const result = await adapter.generate({ prompt: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not installed');
  });

  it('status reports runtime_dependency_missing initially', async () => {
    const result = await adapter.status();
    expect(result.state).toBe('runtime_dependency_missing');
  });

  describe('with mocked incomplete bindings', () => {
    beforeEach(() => {
      adapter = new LiteRTGemmaRuntimeAdapter();
      (adapter as any).bindings = { dummy: true };
      (adapter as any).loadAttempted = true;
    });

    it('loadModel reports runtime_binding_incomplete if loadModel is missing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = await adapter.loadModel('fake/path.litertlm');
      expect(result.success).toBe(false);
      expect(result.state).toBe('runtime_binding_incomplete');
    });

    it('generate reports error if generate is missing', async () => {
      (adapter as any).bindings = {
        loadModel: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await adapter.loadModel('fake/path.litertlm');

      const result = await adapter.generate({ prompt: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not export a generate method');
    });
  });
});
