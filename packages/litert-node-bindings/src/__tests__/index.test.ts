import { describe, it, expect } from 'vitest';
import { litertBindings } from '../index.js';

describe('LiteRtNodeBindings', () => {
  it('should export the canonical litertBindings object', () => {
    expect(litertBindings).toBeDefined();
    expect(typeof litertBindings.status).toBe('function');
    expect(typeof litertBindings.loadModel).toBe('function');
    expect(typeof litertBindings.generate).toBe('function');
    expect(typeof litertBindings.unloadModel).toBe('function');
  });

  it('should return a valid status payload', () => {
    const status = litertBindings.status();
    expect(status).toBeDefined();
    expect(typeof status.ok).toBe('boolean');
    expect(typeof status.state).toBe('string');
    expect(typeof status.message).toBe('string');
  });

  it('should reject loading models gracefully when native addon is missing', async () => {
    // If the addon isn't compiled, loading should fail gracefully rather than crashing
    const status = litertBindings.status();
    if (!status.ok) {
      const result = await litertBindings.loadModel('dummy-path.bin');
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    }
  });

  it('should reject generation gracefully when native addon is missing', async () => {
    const status = litertBindings.status();
    if (!status.ok) {
      const result = await litertBindings.generate('hello');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }
  });
});
