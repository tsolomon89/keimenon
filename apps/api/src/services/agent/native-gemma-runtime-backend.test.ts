import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NativeGemmaRuntimeBackend } from './native-gemma-runtime-backend';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

vi.mock('fs');
vi.mock('child_process');

describe('NativeGemmaRuntimeBackend', () => {
  let backend: NativeGemmaRuntimeBackend;

  beforeEach(() => {
    backend = new NativeGemmaRuntimeBackend();
    vi.resetAllMocks();
    delete process.env.KEIMENON_INFERENCE_HELPER_PATH;
    delete process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return missing status if no path exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const status = await backend.checkStatus();

    expect(status.state).toBe('runtime_missing');
    expect(status.message).toBe('Native helper process not found.');
  });

  it('should resolve explicit env var path', async () => {
    process.env.KEIMENON_INFERENCE_HELPER_PATH = '/custom/path/helper.js';
    vi.mocked(fs.existsSync).mockImplementation((path) => path === '/custom/path/helper.js');

    const mockSpawn = vi.fn();
    vi.mocked(child_process.spawn).mockImplementation(mockSpawn as any);

    // Mock the spawn process
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    // Run checkStatus in background
    const statusPromise = backend.checkStatus();

    // Ensure spawn was called correctly
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/custom/path/helper.js'],
      expect.any(Object)
    );

    // Simulate helper response
    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { state: 'ready', message: 'Ready' },
          }) + '\n'
        )
      );
    }, 10);

    const status = await statusPromise;
    expect(status.state).toBe('ready');
  });

  it('should handle timeout and kill process', async () => {
    process.env.KEIMENON_INFERENCE_HELPER_PATH = '/custom/path/helper.js';
    process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS = '50';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockSpawn = vi.fn();
    vi.mocked(child_process.spawn).mockImplementation(mockSpawn as any);

    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    const status = await backend.checkStatus();

    expect(mockProcess.kill).toHaveBeenCalled();
    expect(status.state).toBe('error');
    expect(status.message).toBe('Exception in checkStatus: Helper request status timed out');
  });

  it('should handle runtime error from helper', async () => {
    process.env.KEIMENON_INFERENCE_HELPER_PATH = '/custom/path/helper.js';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockSpawn = vi.fn();
    vi.mocked(child_process.spawn).mockImplementation(mockSpawn as any);

    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    const statusPromise = backend.checkStatus();

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            ok: false,
            error: { code: 'RUNTIME_UNIMPLEMENTED', message: 'Not implemented' },
          }) + '\n'
        )
      );
    }, 10);

    const status = await statusPromise;
    expect(status.state).toBe('runtime_unimplemented');
    expect(status.message).toBe('Not implemented');
  });
});
