import { describe, it, expect } from 'vitest';
import { UnimplementedGemmaRuntimeAdapter } from '../unimplemented-adapter';

describe('UnimplementedGemmaRuntimeAdapter', () => {
  const adapter = new UnimplementedGemmaRuntimeAdapter();

  it('returns runtime_unimplemented for status', async () => {
    const status = await adapter.status();
    expect(status.ok).toBe(true);
    expect(status.state).toBe('runtime_unimplemented');
    expect(status.message).toContain('unimplemented');
  });

  it('returns valid: false for validateModelFile', async () => {
    const validation = await adapter.validateModelFile('some/path.litertlm');
    expect(validation.valid).toBe(false);
    expect(validation.state).toBe('runtime_unimplemented');
  });

  it('returns success: false for loadModel', async () => {
    const load = await adapter.loadModel('some/path.litertlm');
    expect(load.success).toBe(false);
    expect(load.state).toBe('runtime_unimplemented');
  });

  it('returns success: false for generate', async () => {
    const gen = await adapter.generate({ prompt: 'hello' });
    expect(gen.success).toBe(false);
    expect(gen.error).toContain('not implemented');
  });

  it('unloads model with no-op', async () => {
    await expect(adapter.unloadModel()).resolves.not.toThrow();
  });
});
