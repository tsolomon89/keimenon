import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

vi.mock('bindings', () => {
  return {
    default: vi.fn(() => mockNative),
  };
});

let mockNative: any;

import { getLiteRTBindings } from '../index';

describe('litert-node-bindings', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.KEIMENON_NATIVE_DEPS_DIR;

    mockNative = {
      status: vi.fn(),
      loadModel: vi.fn(),
      generate: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('missing KEIMENON_NATIVE_DEPS_DIR returns dependency missing', () => {
    mockNative.status.mockReturnValue({
      state: 'runtime_dependency_missing',
      details: 'KEIMENON_NATIVE_DEPS_DIR is not configured.',
      dependencies: [{ filename: 'libLiteRt.dll', required: true, present: false }],
    });

    const bindings = getLiteRTBindings();
    const result = bindings.status();

    expect(result.state).toBe('runtime_dependency_missing');
    expect(result.details).toContain('not configured');
  });

  it('configured dir with missing required DLL returns dependency missing', () => {
    process.env.KEIMENON_NATIVE_DEPS_DIR = '/fake/path';
    mockNative.status.mockReturnValue({
      state: 'runtime_dependency_missing',
      details: 'Required dependencies are missing.',
      native_deps_dir: '/fake/path',
      dependencies: [
        {
          filename: 'libLiteRt.dll',
          path: '/fake/path/libLiteRt.dll',
          required: true,
          present: false,
        },
      ],
    });

    const bindings = getLiteRTBindings();
    const result = bindings.status();

    expect(result.state).toBe('runtime_dependency_missing');
    expect(result.native_deps_dir).toBe('/fake/path');
    expect(result.dependencies[0].present).toBe(false);
  });

  it('configured dir with required DLL present and optional missing returns dependency partial', () => {
    process.env.KEIMENON_NATIVE_DEPS_DIR = '/fake/path';
    mockNative.status.mockReturnValue({
      state: 'runtime_dependency_partial',
      details: 'Required dependencies found, but optional dependencies are missing.',
      native_deps_dir: '/fake/path',
      dependencies: [
        {
          filename: 'libLiteRt.dll',
          path: '/fake/path/libLiteRt.dll',
          required: true,
          present: true,
        },
        {
          filename: 'libLiteRtWebGpuAccelerator.dll',
          path: '/fake/path/libLiteRtWebGpuAccelerator.dll',
          required: false,
          present: false,
        },
      ],
    });

    const bindings = getLiteRTBindings();
    const result = bindings.status();

    expect(result.state).toBe('runtime_dependency_partial');
    expect(result.dependencies[0].present).toBe(true);
    expect(result.dependencies[1].present).toBe(false);
  });

  it('all DLLs present returns binding incomplete', () => {
    process.env.KEIMENON_NATIVE_DEPS_DIR = '/fake/path';
    mockNative.status.mockReturnValue({
      state: 'runtime_binding_incomplete',
      details: 'All dependencies found, but C++ API is not fully linked.',
      native_deps_dir: '/fake/path',
      dependencies: [
        {
          filename: 'libLiteRt.dll',
          path: '/fake/path/libLiteRt.dll',
          required: true,
          present: true,
        },
        {
          filename: 'libLiteRtWebGpuAccelerator.dll',
          path: '/fake/path/libLiteRtWebGpuAccelerator.dll',
          required: false,
          present: true,
        },
      ],
    });

    const bindings = getLiteRTBindings();
    const result = bindings.status();

    expect(result.state).toBe('runtime_binding_incomplete');
  });

  it('dependency status includes absolute paths', () => {
    process.env.KEIMENON_NATIVE_DEPS_DIR = '/fake/path';
    mockNative.status.mockReturnValue({
      state: 'runtime_binding_incomplete',
      dependencies: [
        {
          filename: 'libLiteRt.dll',
          path: '/fake/path/libLiteRt.dll',
          required: true,
          present: true,
        },
      ],
    });

    const bindings = getLiteRTBindings();
    const result = bindings.status();

    expect(result.dependencies[0].path).toBe('/fake/path/libLiteRt.dll');
  });
});
