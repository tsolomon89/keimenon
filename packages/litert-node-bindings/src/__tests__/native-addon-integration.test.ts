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
});
