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

  describe('with mocked native bindings', () => {
    let mockBindings: any;

    beforeEach(() => {
      mockBindings = {
        status: vi.fn(),
        loadModel: vi.fn(),
        generate: vi.fn(),
        unloadModel: vi.fn(),
      };
      adapter = new LiteRTGemmaRuntimeAdapter();
      (adapter as any).bindings = mockBindings;
    });

    it('status calls native status and propagates fields', async () => {
      mockBindings.status.mockResolvedValue({
        state: 'ready',
        native_deps_dir: '/test/deps/dir',
        dependencies: [{ filename: 'libLiteRt.dll', present: true, required: true }],
        details: 'Native LiteRT-LM runtime is ready.',
        platform: 'win32',
        arch: 'x64',
      });

      const result = await adapter.status();
      expect(mockBindings.status).toHaveBeenCalled();
      expect(result.state).toBe('ready');
      expect(result.native_deps_dir).toBe('/test/deps/dir');
      expect(result.dependencies).toEqual([
        { filename: 'libLiteRt.dll', present: true, required: true },
      ]);
      expect(result.platform).toBe('win32');
      expect(result.arch).toBe('x64');
      expect(result.details).toBe('Native LiteRT-LM runtime is ready.');
    });

    it('status does not report ready when native status is dependency missing', async () => {
      mockBindings.status.mockResolvedValue({
        state: 'runtime_dependency_missing',
        native_deps_dir: '',
        dependencies: [],
        details: 'Required dependencies are missing.',
      });

      const result = await adapter.status();
      expect(result.state).toBe('runtime_dependency_missing');
    });

    it('status does not report ready when native status is dependency partial', async () => {
      mockBindings.status.mockResolvedValue({
        state: 'runtime_dependency_partial',
        native_deps_dir: '/test/deps/dir',
        dependencies: [
          { filename: 'libLiteRtWebGpuAccelerator.dll', present: false, required: false },
        ],
        details: 'Optional dependencies are missing.',
      });

      const result = await adapter.status();
      expect(result.state).toBe('runtime_dependency_partial');
    });

    it('loadModel maps native exception RUNTIME_DEPENDENCY_MISSING', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockBindings.loadModel.mockRejectedValue(
        new Error('RUNTIME_DEPENDENCY_MISSING: libLiteRt.dll is not available.')
      );

      const result = await adapter.loadModel('fake/path.litertlm');
      expect(result.success).toBe(false);
      expect(result.state).toBe('runtime_dependency_missing');
      expect(result.message).toContain('RUNTIME_DEPENDENCY_MISSING');
    });

    it('loadModel maps native exception MODEL_INVALID', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockBindings.loadModel.mockRejectedValue(
        new Error('MODEL_INVALID: File extension must be .litertlm')
      );

      const result = await adapter.loadModel('fake/path.litertlm');
      expect(result.success).toBe(false);
      expect(result.state).toBe('model_invalid');
      expect(result.message).toContain('MODEL_INVALID');
    });

    it('loadModel maps native exception MODEL_MISSING', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockBindings.loadModel.mockRejectedValue(
        new Error('MODEL_MISSING: Model file does not exist')
      );

      const result = await adapter.loadModel('fake/path.litertlm');
      expect(result.success).toBe(false);
      expect(result.state).toBe('model_missing');
      expect(result.message).toContain('MODEL_MISSING');
    });

    it('loadModel maps native exception MODEL_LOAD_FAILED', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockBindings.loadModel.mockRejectedValue(
        new Error('MODEL_LOAD_FAILED: Failed to create engine settings')
      );

      const result = await adapter.loadModel('fake/path.litertlm');
      expect(result.success).toBe(false);
      expect(result.state).toBe('model_load_failed');
      expect(result.message).toContain('MODEL_LOAD_FAILED');
    });

    it('generate maps native exceptions MODEL_NOT_LOADED and INFERENCE_FAILED', async () => {
      // Simulate loaded first to pass the check
      (adapter as any).isLoaded = true;

      mockBindings.generate.mockRejectedValue(new Error('MODEL_NOT_LOADED: No model is loaded.'));
      let result = await adapter.generate({ prompt: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot generate: No model is loaded.');

      mockBindings.generate.mockRejectedValue(new Error('INFERENCE_FAILED: Failed to generate'));
      result = await adapter.generate({ prompt: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Inference failed: LiteRT-LM failed to generate content.');
    });
  });
});

import * as bindingLoader from '../binding-loader';

describe('LiteRTGemmaRuntimeAdapter with mocked binding-loader', () => {
  it('status bubbles partial state and dependencies', async () => {
    const adapter = new LiteRTGemmaRuntimeAdapter();
    const spy = vi.spyOn(bindingLoader, 'tryLoadBindings').mockReturnValueOnce({
      state: 'runtime_dependency_partial',
      bindings: null,
      native_deps_dir: '/fake/path/native/win32-x64/bin',
      dependencies: [{ filename: 'test.dll', present: true, required: true }],
    });

    const result = await adapter.status();
    expect(result.state).toBe('runtime_dependency_partial');
    expect(result.dependencies).toEqual([{ filename: 'test.dll', present: true, required: true }]);
    expect(result.native_deps_dir).toBe('/fake/path/native/win32-x64/bin');

    spy.mockRestore();
  });
});
