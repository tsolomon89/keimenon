import type { LiteRTNodeBindings } from '@keimenon/litert-node-bindings';
import { HelperStatusState } from './adapter';

export interface BindingResolution {
  state: HelperStatusState;
  bindings: LiteRTNodeBindings | null;
}

export function tryLoadBindings(
  moduleName = '@keimenon/litert-node-bindings',
  bindingsOverride?: any
): BindingResolution {
  let bindings: any;
  if (bindingsOverride !== undefined) {
    bindings = bindingsOverride;
  } else {
    try {
      // Dynamically require the package
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      bindings = require(moduleName);
    } catch (err) {
      return {
        state: 'runtime_dependency_missing',
        bindings: null,
      };
    }
  }

  // Ensure the binding object is present
  if (!bindings) {
    return {
      state: 'runtime_dependency_missing',
      bindings: null,
    };
  }

  // Verify completeness of the ABI contract
  if (typeof bindings.loadModel !== 'function') {
    return {
      state: 'runtime_binding_incomplete',
      bindings: null,
    };
  }

  if (typeof bindings.generate !== 'function') {
    return {
      state: 'runtime_binding_incomplete',
      bindings: null,
    };
  }

  return {
    state: 'ready',
    bindings: bindings as LiteRTNodeBindings,
  };
}
