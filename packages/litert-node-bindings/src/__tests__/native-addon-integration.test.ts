import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Native Addon Real Binary Integration', () => {
  const binaryPaths = [
    path.resolve(__dirname, '../../../build/Release/litert_node_bindings.node'),
    path.resolve(__dirname, '../../native/win32-x64/litert_node_bindings.node'),
  ];

  it('must find compiled litert_node_bindings.node binary on disk', () => {
    const existing = binaryPaths.filter((p) => fs.existsSync(p));
    expect(
      existing.length,
      `Expected at least one compiled native binary at: ${binaryPaths.join(', ')}`
    ).toBeGreaterThan(0);
  });

  it('must load compiled native binary directly via require() without throwing', () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    expect(target).toBeDefined();

    const addon = require(target!);
    expect(addon).toBeDefined();
    expect(typeof addon.status).toBe('function');
    expect(typeof addon.loadModel).toBe('function');
    expect(typeof addon.generate).toBe('function');
    expect(typeof addon.cancel).toBe('function');
    expect(typeof addon.unloadModel).toBe('function');
  });

  it('must report status truthfully from native C++ layer', () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    const addon = require(target!);
    const status = addon.status();

    expect(status).toBeDefined();
    expect(typeof status.ok).toBe('boolean');
    expect(typeof status.state).toBe('string');
    expect(typeof status.message).toBe('string');
  });

  it('must support asynchronous cancel without deadlock', async () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    const addon = require(target!);

    // Should resolve cleanly even if no session is active
    await expect(addon.cancel()).resolves.toBeUndefined();
  });

  it('must fail gracefully when loading an invalid model path', async () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    const addon = require(target!);

    const result = await addon.loadModel('C:\\nonexistent\\invalid_model_path.litertlm');
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it('must reject generation when no model is loaded', async () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    const addon = require(target!);

    const result = await addon.generate('Hello world', 50);
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('must load a genuine model, generate tokens on CPU, and safely unload resources', async () => {
    const target = binaryPaths.find((p) => fs.existsSync(p));
    const addon = require(target!);

    const modelPath = path.resolve(
      __dirname,
      '../../../../vendor/litert-lm/runtime/testdata/test_lm_new_metadata.task'
    );

    if (!fs.existsSync(modelPath)) {
      console.warn('Real test model fixture not present at:', modelPath);
      return;
    }

    // 1. Load model
    const loadResult = await addon.loadModel(modelPath);
    expect(loadResult).toBeDefined();
    expect(loadResult.success).toBe(true);
    expect(loadResult.message).toContain('loaded successfully');

    // 2. Verify loaded status
    const loadedStatus = addon.status();
    expect(loadedStatus.ok).toBe(true);
    expect(loadedStatus.state).toBe('model_loaded');

    // 3. Generate tokens
    const genResult = await addon.generate('Hello', 10);
    expect(genResult).toBeDefined();
    expect(genResult.success).toBe(true);
    expect(typeof genResult.text).toBe('string');
    expect(genResult.text.length).toBeGreaterThan(0);

    // 4. Safely unload model
    await expect(addon.unloadModel()).resolves.toBeUndefined();

    // 5. Verify status reverts
    const postStatus = addon.status();
    expect(postStatus.ok).toBe(true);
    expect(postStatus.state).toBe('runtime_dependency_found');
  });
});
