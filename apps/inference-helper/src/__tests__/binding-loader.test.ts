import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryLoadBindings } from '../binding-loader';

describe('binding-loader', () => {
  it('returns runtime_dependency_missing if package throws', () => {
    // Pass a dummy module name that will definitely fail to load
    const result = tryLoadBindings('non-existent-module-12345');
    expect(result.state).toBe('runtime_dependency_missing');
    expect(result.bindings).toBeNull();
  });

  it('returns runtime_binding_incomplete if loadModel is missing', () => {
    const mockBindings = {
      generate: vi.fn(),
    };
    const result = tryLoadBindings('@keimenon/litert-node-bindings', mockBindings);
    expect(result.state).toBe('runtime_binding_incomplete');
    expect(result.bindings).toBeNull();
  });

  it('returns runtime_binding_incomplete if generate is missing', () => {
    const mockBindings = {
      loadModel: vi.fn(),
    };
    const result = tryLoadBindings('@keimenon/litert-node-bindings', mockBindings);
    expect(result.state).toBe('runtime_binding_incomplete');
    expect(result.bindings).toBeNull();
  });

  it('returns ready if all methods are present', () => {
    const mockBindings = {
      status: vi.fn().mockReturnValue({ state: 'ready' }),
      loadModel: vi.fn(),
      generate: vi.fn(),
    };
    const result = tryLoadBindings('@keimenon/litert-node-bindings', mockBindings);
    expect(result.state).toBe('ready');
    expect(result.bindings).not.toBeNull();
  });
});
